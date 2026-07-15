const PROFILE_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i;
const MAX_PROFILE_UPLOAD_BYTES = 6 * 1024 * 1024;
const MAX_PROFILE_DATA_URL_LENGTH = 200_000;
const PROFILE_OUTPUT_TYPE = "image/webp";
const PROFILE_OUTPUT_SIZE = 256;
const PROFILE_MIN_OUTPUT_SIZE = 160;
const PROFILE_INITIAL_OUTPUT_QUALITY = 0.84;
const PROFILE_MIN_OUTPUT_QUALITY = 0.68;

export const PROFILE_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/gif";

const loadImageFile = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = window.URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      window.URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      window.URL.revokeObjectURL(objectUrl);
      reject(new Error(`Unable to read ${file.name}`));
    };

    image.src = objectUrl;
  });

const renderCroppedAvatarDataUrl = (
  image: HTMLImageElement,
  size: number,
  quality: number
) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser could not prepare this profile image.");
  }

  const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sourceX = Math.max(((image.naturalWidth || image.width) - sourceSize) / 2, 0);
  const sourceY = Math.max(((image.naturalHeight || image.height) - sourceSize) / 2, 0);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

  return canvas.toDataURL(PROFILE_OUTPUT_TYPE, quality);
};

export async function prepareProfileAvatarDataUrl(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Upload a PNG, JPG, WebP, GIF, or another supported image file.");
  }

  if (file.size > MAX_PROFILE_UPLOAD_BYTES) {
    throw new Error("Profile images must be 6 MB or smaller before processing.");
  }

  const image = await loadImageFile(file);
  let size = PROFILE_OUTPUT_SIZE;
  let quality = PROFILE_INITIAL_OUTPUT_QUALITY;
  let dataUrl = renderCroppedAvatarDataUrl(image, size, quality);

  while (
    dataUrl.length > MAX_PROFILE_DATA_URL_LENGTH
    && (quality > PROFILE_MIN_OUTPUT_QUALITY || size > PROFILE_MIN_OUTPUT_SIZE)
  ) {
    if (quality > PROFILE_MIN_OUTPUT_QUALITY) {
      quality = Math.max(PROFILE_MIN_OUTPUT_QUALITY, quality - 0.08);
    } else if (size > PROFILE_MIN_OUTPUT_SIZE) {
      size = Math.max(PROFILE_MIN_OUTPUT_SIZE, size - 24);
    }

    dataUrl = renderCroppedAvatarDataUrl(image, size, quality);
  }

  if (dataUrl.length > MAX_PROFILE_DATA_URL_LENGTH) {
    throw new Error("This image is still too large after compression. Try a simpler image or a smaller crop.");
  }

  if (!PROFILE_IMAGE_PATTERN.test(dataUrl)) {
    throw new Error("Unable to encode the selected image for your profile.");
  }

  return dataUrl;
}
