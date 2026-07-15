import type { AiDesignImageInput, AiDesignedTestCaseCandidate } from "../types";
import type { Requirement } from "../types";

export const AI_CONTEXT_PACK_LIMIT = 18_000;
const REQUIREMENT_CONTEXT_LIMIT = 7_000;
const KNOWLEDGE_CONTEXT_LIMIT = 6_000;
const FILE_CONTEXT_LIMIT = 4_000;
const FILE_CONTEXT_PER_FILE_LIMIT = 1_600;
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
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const buildRequirementContextSection = (requirements: Requirement[]) => {
  if (!requirements.length) {
    return "";
  }

  const useDescriptions = requirements.length <= 12;
  const lines = requirements.map((requirement, index) => {
    const label = requirement.display_id || requirement.id || `REQ-${index + 1}`;
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
    `Selected requirements (${requirements.length}; ${useDescriptions ? "titles and descriptions" : "titles only to stay within context limits"}):`,
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
  const selectedFiles = Array.from(files || []).slice(0, 5);

  if (!selectedFiles.length) {
    return { section: "", skipped: [] as string[] };
  }

  const snippets: string[] = [];
  const skipped: string[] = [];

  for (const file of selectedFiles) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const isTextLike = file.type.startsWith("text/")
      || ["application/json", "application/xml", "application/x-yaml"].includes(file.type)
      || TEXT_CONTEXT_EXTENSIONS.has(extension);

    if (!isTextLike) {
      skipped.push(`${file.name} (unsupported for prompt text)`);
      continue;
    }

    if (file.size > 1_500_000) {
      skipped.push(`${file.name} (larger than 1.5 MB)`);
      continue;
    }

    try {
      const text = trimToBudget(compactText(await readFileAsText(file)), FILE_CONTEXT_PER_FILE_LIMIT);
      if (text) {
        snippets.push(`File: ${file.name}\n${text}`);
      }
    } catch {
      skipped.push(`${file.name} (could not be read)`);
    }
  }

  return {
    section: snippets.length ? trimToBudget(["Attached file context:", ...snippets].join("\n\n"), FILE_CONTEXT_LIMIT) : "",
    skipped
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

const compressImageDataUrl = async (dataUrl: string, maxEdge = 720, quality = 0.35) => {
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
