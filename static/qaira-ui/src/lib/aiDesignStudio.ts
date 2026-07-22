import type { AiDesignImageInput, AiDesignedTestCaseCandidate } from "../types";
import type { Requirement } from "../types";

export const AI_CONTEXT_PACK_LIMIT = 18_000;
const REQUIREMENT_CONTEXT_LIMIT = 7_000;
const KNOWLEDGE_CONTEXT_LIMIT = 6_000;
const FILE_CONTEXT_LIMIT = 4_000;
const FILE_CONTEXT_PER_FILE_LIMIT = 1_250;
const FILE_CONTEXT_MAX_FILES = 5;
const FILE_CONTEXT_MAX_FILE_BYTES = 1_500_000;
const FILE_CONTEXT_MAX_TOTAL_BYTES = 3_500_000;
const FILE_CONTEXT_READ_LIMIT = 180_000;
const REFERENCE_IMAGE_MAX_COUNT = 6;
const REFERENCE_IMAGE_MAX_TOTAL_CHARS = 950_000;
const REFERENCE_IMAGE_MAX_FILE_BYTES = 8_000_000;
const TEXT_CONTEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json", "xml", "yaml", "yml", "feature", "log"]);

const trimToBudget = (value: string, limit: number) => {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 120)).trimEnd()}\n[Truncated to keep the AI prompt within QAira context limits.]`;
};

const compactText = (value: unknown) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/data:[^,\s]+;base64,[A-Za-z0-9+/=]+/g, "[base64 attachment omitted]")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const compressFileTextForPrompt = (value: string, limit: number) => {
  const text = compactText(value).slice(0, FILE_CONTEXT_READ_LIMIT);

  if (text.length <= limit) {
    return text;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const importantLines = lines
    .filter((line) => /(shall|must|should|acceptance|criteria|requirement|risk|error|fail|security|permission|role|admin|audit|api|workflow|boundary|edge|constraint|metric|evidence)/i.test(line))
    .slice(0, 18);
  const sampled = [
    text.slice(0, Math.floor(limit * 0.36)),
    importantLines.length ? `Key story-like lines:\n${importantLines.join("\n")}` : "",
    text.slice(Math.max(0, text.length - Math.floor(limit * 0.28)))
  ].filter(Boolean).join("\n...\n");

  return trimToBudget(sampled, limit);
};

export const buildRequirementContextSection = (requirements: Requirement[]) => {
  if (!requirements.length) {
    return "";
  }

  const useDescriptions = requirements.length <= 12;
  const lines = requirements.map((requirement, index) => {
    const label = requirement.display_id || requirement.id || `STORY-${index + 1}`;
    const title = compactText(requirement.title);

    if (!useDescriptions) {
      return `- ${label}: ${title}`;
    }

    const description = trimToBudget(compactText(requirement.description || ""), 520);
    return [
      `- ${label}: ${title}`,
      description ? `  Description: ${description}` : ""
    ].filter(Boolean).join("\n");
  });

  return trimToBudget([
    `Selected stories (${requirements.length}; ${useDescriptions ? "titles and descriptions" : "titles only to stay within context limits"}):`,
    ...lines
  ].join("\n"), REQUIREMENT_CONTEXT_LIMIT);
};

export const buildKnowledgeContextSection = (knowledge: any[] = []) => {
  const activeItems = knowledge
    .filter((item) => item && item.is_active !== false)
    .slice(0, 8);

  if (!activeItems.length) {
    return "";
  }

  const lines = activeItems.map((item, index) => {
    const title = compactText(item.title || `Knowledge ${index + 1}`);
    const description = compactText(item.description || "");
    const content = trimToBudget(compactText(item.content || ""), 520);
    const meta = [
      item.asset_type ? `type=${item.asset_type}` : "",
      item.priority ? `priority=${item.priority}` : "",
      item.source ? `source=${item.source}` : ""
    ].filter(Boolean).join(", ");

    return [
      `- ${title}${meta ? ` (${meta})` : ""}`,
      description ? `  Summary: ${trimToBudget(description, 260)}` : "",
      content ? `  Content: ${content}` : ""
    ].filter(Boolean).join("\n");
  });

  return trimToBudget(["Relevant AI Knowledge:", ...lines].join("\n"), KNOWLEDGE_CONTEXT_LIMIT);
};

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsText(file);
  });

export const buildFileContextSection = async (files: FileList | null) => {
  const allFiles = Array.from(files || []);
  const selectedFiles = allFiles.slice(0, FILE_CONTEXT_MAX_FILES);

  if (!selectedFiles.length) {
    return { section: "", skipped: [] as string[], blocked: [] as string[], overLimit: false, included: 0, totalOriginalChars: 0, totalPackedChars: 0 };
  }

  const snippets: string[] = [];
  const skipped: string[] = [];
  const blocked: string[] = [];
  let totalOriginalChars = 0;
  let totalPackedChars = 0;

  if (allFiles.length > FILE_CONTEXT_MAX_FILES) {
    blocked.push(`Select at most ${FILE_CONTEXT_MAX_FILES} context files. Remove ${allFiles.length - FILE_CONTEXT_MAX_FILES} file${allFiles.length - FILE_CONTEXT_MAX_FILES === 1 ? "" : "s"}.`);
  }

  const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  if (selectedBytes > FILE_CONTEXT_MAX_TOTAL_BYTES) {
    blocked.push(`Selected files are ${(selectedBytes / 1_000_000).toFixed(1)} MB before compression; keep the set under ${(FILE_CONTEXT_MAX_TOTAL_BYTES / 1_000_000).toFixed(1)} MB.`);
  }

  for (const file of selectedFiles) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const isTextLike = file.type.startsWith("text/")
      || ["application/json", "application/xml", "application/x-yaml"].includes(file.type)
      || TEXT_CONTEXT_EXTENSIONS.has(extension);

    if (!isTextLike) {
      skipped.push(`${file.name} (unsupported for prompt text)`);
      continue;
    }

    if (file.size > FILE_CONTEXT_MAX_FILE_BYTES) {
      blocked.push(`${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB; remove or split files larger than ${(FILE_CONTEXT_MAX_FILE_BYTES / 1_000_000).toFixed(1)} MB.`);
      continue;
    }
  }

  if (blocked.length) {
    return { section: "", skipped, blocked, overLimit: true, included: 0, totalOriginalChars, totalPackedChars };
  }

  for (const file of selectedFiles) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const isTextLike = file.type.startsWith("text/")
      || ["application/json", "application/xml", "application/x-yaml"].includes(file.type)
      || TEXT_CONTEXT_EXTENSIONS.has(extension);

    if (!isTextLike) {
      continue;
    }

    try {
      const originalText = await readFileAsText(file);
      totalOriginalChars += originalText.length;
      const text = compressFileTextForPrompt(originalText, FILE_CONTEXT_PER_FILE_LIMIT);
      totalPackedChars += text.length;
      if (text) {
        snippets.push(`File: ${file.name} (${file.size.toLocaleString()} bytes compressed for prompt)\n${text}`);
      }
    } catch {
      skipped.push(`${file.name} (could not be read)`);
    }
  }

  return {
    section: snippets.length ? trimToBudget(["Attached file context:", ...snippets].join("\n\n"), FILE_CONTEXT_LIMIT) : "",
    skipped,
    blocked,
    overLimit: false,
    included: snippets.length,
    totalOriginalChars,
    totalPackedChars
  };
};

export const mergeAiContextPack = (current: string, sections: string[]) => {
  const contextPack = sections.map(compactText).filter(Boolean).join("\n\n");

  if (!contextPack) {
    return trimToBudget(current, AI_CONTEXT_PACK_LIMIT);
  }

  return trimToBudget([compactText(current), contextPack].filter(Boolean).join("\n\n---\n\n"), AI_CONTEXT_PACK_LIMIT);
};

export const parseExternalLinks = (value: string) =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image for compression."));
    image.src = url;
  });

const compressImageDataUrl = async (dataUrl: string, maxEdge = 520, quality = 0.28) => {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height, 1));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return dataUrl;
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
};

export const readImageFiles = async (files: FileList | null) => {
  const collection = Array.from(files || []);
  const oversized = collection.find((file) => file.size > REFERENCE_IMAGE_MAX_FILE_BYTES);
  if (oversized) {
    throw new Error(`${oversized.name} is too large for AI context. Remove it or upload a smaller screenshot.`);
  }
  const images = await Promise.all(
    collection.map(async (file) => ({
      name: file.name,
      url: await compressImageDataUrl(await readFileAsDataUrl(file))
    }))
  );

  return images.filter((image) => image.url) as AiDesignImageInput[];
};

export const appendUniqueImages = (current: AiDesignImageInput[], incoming: AiDesignImageInput[]) => {
  const byUrl = new Map(current.map((image) => [image.url, image]));

  incoming.forEach((image) => {
    byUrl.set(image.url, image);
  });

  return Array.from(byUrl.values());
};

export const mergeAiReferenceImagesWithinBudget = (current: AiDesignImageInput[], incoming: AiDesignImageInput[]) => {
  const images = appendUniqueImages(current, incoming);
  const totalChars = images.reduce((sum, image) => sum + image.url.length, 0);

  if (images.length > REFERENCE_IMAGE_MAX_COUNT) {
    return {
      images: current,
      message: `AI reference images are limited to ${REFERENCE_IMAGE_MAX_COUNT}. Remove older screenshots before adding more.`
    };
  }

  if (totalChars > REFERENCE_IMAGE_MAX_TOTAL_CHARS) {
    return {
      images: current,
      message: "The compressed screenshots still exceed the AI context budget. Remove one or more images, or crop them to the important area."
    };
  }

  return { images, message: "" };
};

export const toggleRequirementOnPreviewCase = (
  cases: AiDesignedTestCaseCandidate[],
  clientId: string,
  requirementId: string,
  requirementTitle: string
) =>
  cases.map((candidate) => {
    if (candidate.client_id !== clientId) {
      return candidate;
    }

    const hasRequirement = candidate.requirement_ids.includes(requirementId);
    const requirement_ids = hasRequirement
      ? candidate.requirement_ids.filter((id) => id !== requirementId)
      : [...candidate.requirement_ids, requirementId];
    const requirement_titles = hasRequirement
      ? candidate.requirement_titles.filter((title) => title !== requirementTitle)
      : [...candidate.requirement_titles, requirementTitle];

    return {
      ...candidate,
      requirement_ids,
      requirement_titles
    };
  });
