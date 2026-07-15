import { strFromU8, unzipSync } from "fflate";
import { parseCsvGrid } from "./csvGrid";
import type { ObjectRepositoryImportEntry } from "../types";

export type ObjectRepositoryImportPreview = {
  entries: ObjectRepositoryImportEntry[];
  fileNames: string[];
  inputKinds: Array<"csv" | "source" | "zip">;
  warnings: string[];
};

const SOURCE_FILE_PATTERN = /\.(?:js|jsx|ts|tsx|java|cs)$/i;
const MAX_ARCHIVE_FILES = 500;
const MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;

const text = (value: unknown) => String(value ?? "").trim();

const sourceLanguage = (fileName: string) => {
  const extension = fileName.toLowerCase().split(".").pop() || "";
  if (extension === "java") return "java";
  if (extension === "cs") return "csharp";
  if (extension === "ts" || extension === "tsx") return "typescript";
  return "javascript";
};

const friendlyName = (value: string) => value
  .replace(/([a-z\d])([A-Z])/g, "$1 $2")
  .replace(/[_-]+/g, " ")
  .trim()
  .replace(/\b\w/g, (character) => character.toUpperCase());

const screenNameFromSource = (fileName: string, source: string) => {
  const classMatch = source.match(/\bclass\s+([A-Za-z_$][\w$]*)/);
  const baseName = classMatch?.[1] || fileName.split("/").pop()?.replace(/\.[^.]+$/, "") || "ImportedScreen";
  const stripped = baseName.replace(/(?:PageObject|Page|Screen|Pom)$/i, "");
  return friendlyName(stripped || baseName);
};

const extractPageUrl = (source: string) => {
  const match = source.match(/\b(?:pageUrl|baseUrl|url|URL)\s*(?::[^=;\n]+)?=\s*["'`]([^"'`]+)["'`]/i);
  return match?.[1] || "";
};

const locatorKind = (locator: string, fallback = "css") => {
  if (/data-testid/i.test(locator)) return "data-testid";
  if (/aria-label/i.test(locator)) return "aria-label";
  if (/^role=/i.test(locator)) return "role + name";
  if (/^#/.test(locator)) return "stable id";
  if (/^\[name=/.test(locator)) return "name attribute";
  if (/^xpath=|^\/\//i.test(locator)) return "xpath";
  if (/^text=/i.test(locator)) return "text";
  return fallback;
};

const createScreenEntry = (screenName: string, pageUrl: string, fileName: string, language: string): ObjectRepositoryImportEntry => ({
  screen_name: screenName,
  record_type: "screen",
  page_url: pageUrl || undefined,
  page_key: screenName,
  locator_intent: "__screen__",
  locator: "__screen__",
  locator_kind: "screen",
  confidence: 1,
  source: "source_file_import",
  object_name: "__screen__",
  object_role: "screen",
  metadata: {
    record_kind: "screen",
    screen_name: screenName,
    url_pattern_type: pageUrl ? "contains" : "contains",
    url_pattern_value: pageUrl || screenName,
    imported_file: fileName,
    imported_language: language
  }
});

const createFieldEntry = ({
  screenName,
  pageUrl,
  fileName,
  language,
  name,
  role,
  locator
}: {
  screenName: string;
  pageUrl: string;
  fileName: string;
  language: string;
  name: string;
  role: string;
  locator: string;
}): ObjectRepositoryImportEntry => ({
  screen_name: screenName,
  record_type: "field",
  page_url: pageUrl || undefined,
  page_key: screenName,
  locator_intent: friendlyName(name),
  locator,
  locator_kind: locatorKind(locator),
  confidence: 0.8,
  source: "source_file_import",
  object_name: friendlyName(name),
  object_role: role || "field",
  metadata: {
    screen_name: screenName,
    object_name: friendlyName(name),
    object_role: role || "field",
    imported_file: fileName,
    imported_language: language,
    description: `Imported from ${fileName}.`
  }
});

const parseExpressionLocator = (expression: string) => {
  let match = expression.match(/getByTestId\s*\(\s*["'`]([^"'`]+)["'`]/i);
  if (match) return { locator: `[data-testid="${match[1]}"]`, role: "field" };
  match = expression.match(/getByLabel\s*\(\s*["'`]([^"'`]+)["'`]/i);
  if (match) return { locator: `[aria-label="${match[1]}"]`, role: "field" };
  match = expression.match(/getByPlaceholder\s*\(\s*["'`]([^"'`]+)["'`]/i);
  if (match) return { locator: `[placeholder="${match[1]}"]`, role: "textbox" };
  match = expression.match(/getByText\s*\(\s*["'`]([^"'`]+)["'`]/i);
  if (match) return { locator: `text=${match[1]}`, role: "field" };
  match = expression.match(/getByRole\s*\(\s*["'`]([^"'`]+)["'`](?:\s*,\s*\{[^}]*name\s*:\s*["'`]([^"'`]+)["'`])?/i);
  if (match) return { locator: `role=${match[1]}${match[2] ? `[name="${match[2]}"]` : ""}`, role: match[1] };
  match = expression.match(/locator\s*\(\s*["'`]([^"'`]+)["'`]/i);
  if (match) return { locator: match[1], role: "field" };
  return null;
};

const parseByLocator = (kind: string, value: string) => {
  const normalizedKind = kind.toLowerCase();
  if (normalizedKind === "id") return `#${value}`;
  if (normalizedKind === "name") return `[name="${value}"]`;
  if (normalizedKind === "classname" || normalizedKind === "class") return `.${value}`;
  if (normalizedKind === "linktext") return `text=${value}`;
  if (normalizedKind === "xpath") return `xpath=${value}`;
  return value;
};

export function parseObjectRepositorySource(fileName: string, source: string): ObjectRepositoryImportEntry[] {
  const language = sourceLanguage(fileName);
  const screenName = screenNameFromSource(fileName, source);
  const pageUrl = extractPageUrl(source);
  const entries: ObjectRepositoryImportEntry[] = [createScreenEntry(screenName, pageUrl, fileName, language)];
  const fieldKeys = new Set<string>();
  const addField = (name: string, locator: string, role = "field") => {
    const key = `${name.toLowerCase()}|${locator}`;
    if (!name || !locator || fieldKeys.has(key)) return;
    fieldKeys.add(key);
    entries.push(createFieldEntry({ screenName, pageUrl, fileName, language, name, locator, role }));
  };

  const playwrightPattern = /(?:this\.)?([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(?:this\.)?page\.(getBy(?:TestId|Label|Placeholder|Text|Role)\s*\([^;\n]+\)|locator\s*\([^;\n]+\))/gi;
  let match: RegExpExecArray | null;
  while ((match = playwrightPattern.exec(source))) {
    const parsed = parseExpressionLocator(match[2]);
    if (parsed) addField(match[1], parsed.locator, parsed.role);
  }

  const byAssignmentPattern = /\b([A-Za-z_$][\w$]*)\s*(?:=>|=)\s*(?:[^;\n]*?)By\.(id|name|cssSelector|xpath|className|linkText)\s*\(\s*["']([^"']+)["']\s*\)/gi;
  while ((match = byAssignmentPattern.exec(source))) {
    addField(match[1], parseByLocator(match[2], match[3]));
  }

  const findByPattern = /@FindBy\s*\(\s*(id|name|css|xpath|className)\s*=\s*["']([^"']+)["']\s*\)[\s\S]{0,100}?\b(?:WebElement|By)\s+([A-Za-z_$][\w$]*)/gi;
  while ((match = findByPattern.exec(source))) {
    addField(match[3], parseByLocator(match[1], match[2]));
  }

  const csharpAnnotationPattern = /\[FindsBy\s*\(\s*How\s*=\s*How\.(Id|Name|CssSelector|XPath|ClassName)\s*,\s*Using\s*=\s*["']([^"']+)["']\s*\)\][\s\S]{0,100}?\bIWebElement\s+([A-Za-z_$][\w$]*)/gi;
  while ((match = csharpAnnotationPattern.exec(source))) {
    addField(match[3], parseByLocator(match[1], match[2]));
  }

  return entries;
}

const jsonObject = (value: string) => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const jsonArray = (value: string) => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function parseObjectRepositoryCsv(csv: string): ObjectRepositoryImportEntry[] {
  const rows = parseCsvGrid(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.toLowerCase().replace(/\s+/g, "_"));

  return rows.slice(1).map((cells) => {
    const row = headers.reduce<Record<string, string>>((values, header, index) => {
      values[header] = cells[index] || "";
      return values;
    }, {});
    const metadata: Record<string, unknown> = {
      ...jsonObject(row.metadata_json),
      ...(row.url_pattern_type ? { url_pattern_type: row.url_pattern_type } : {}),
      ...(row.url_pattern_value ? { url_pattern_value: row.url_pattern_value } : {}),
      ...(row.description ? { description: row.description } : {}),
      ...(row.business_meaning ? { business_meaning: row.business_meaning } : {}),
      ...(row.target_criteria ? { target_criteria: jsonArray(row.target_criteria) } : {}),
      ...(row.fallback_locators ? { fallback_locators: jsonArray(row.fallback_locators) } : {}),
      ...(row.usage_keywords ? { usage_keywords: jsonArray(row.usage_keywords) } : {}),
      ...(row.stability_score ? { stability_score: Number(row.stability_score) } : {}),
      ...(row.dom_structure ? { dom_structure: row.dom_structure } : {}),
      ...(row.screenshot_url ? { screenshot_url: row.screenshot_url } : {})
    };
    const recordType = row.record_type.toLowerCase() === "screen" ? "screen" : "field";
    return {
      screen_name: row.screen_name || text(metadata.screen_name) || "Imported Screen",
      record_type: recordType,
      page_url: row.page_url || undefined,
      page_key: row.screen_name || undefined,
      locator_intent: recordType === "screen" ? "__screen__" : row.object_name,
      locator: recordType === "screen" ? "__screen__" : row.locator,
      locator_kind: recordType === "screen" ? "screen" : row.locator_kind,
      confidence: row.confidence ? Number(row.confidence) : undefined,
      source: row.source || "csv_import",
      object_name: recordType === "screen" ? "__screen__" : row.object_name,
      object_role: recordType === "screen" ? "screen" : row.object_role,
      metadata
    };
  });
}

const uniqueEntries = (entries: ObjectRepositoryImportEntry[]) => {
  const byKey = new Map<string, ObjectRepositoryImportEntry>();
  entries.forEach((entry) => {
    const key = `${entry.record_type}|${entry.screen_name.toLowerCase()}|${String(entry.object_name || entry.locator || "").toLowerCase()}`;
    byKey.set(key, entry);
  });
  return Array.from(byKey.values());
};

export async function parseObjectRepositoryFiles(files: File[]): Promise<ObjectRepositoryImportPreview> {
  const entries: ObjectRepositoryImportEntry[] = [];
  const fileNames: string[] = [];
  const inputKinds = new Set<ObjectRepositoryImportPreview["inputKinds"][number]>();
  const warnings: string[] = [];

  for (const file of files) {
    const name = file.name;
    if (/\.csv$/i.test(name)) {
      entries.push(...parseObjectRepositoryCsv(await file.text()));
      fileNames.push(name);
      inputKinds.add("csv");
      continue;
    }
    if (SOURCE_FILE_PATTERN.test(name)) {
      entries.push(...parseObjectRepositorySource(name, await file.text()));
      fileNames.push(name);
      inputKinds.add("source");
      continue;
    }
    if (/\.zip$/i.test(name)) {
      inputKinds.add("zip");
      let unpacked: Record<string, Uint8Array>;
      try {
        unpacked = unzipSync(new Uint8Array(await file.arrayBuffer()));
      } catch {
        warnings.push(`${name}: unable to open ZIP archive.`);
        continue;
      }
      const sourceFiles = Object.entries(unpacked)
        .filter(([entryName]) => SOURCE_FILE_PATTERN.test(entryName) && !/(?:^|\/)(?:node_modules|dist|build|target|bin|obj)\//i.test(entryName));
      let expandedBytes = 0;
      let processedFiles = 0;
      for (const [entryName, bytes] of sourceFiles) {
        if (processedFiles >= MAX_ARCHIVE_FILES || expandedBytes + bytes.length > MAX_ARCHIVE_BYTES) {
          warnings.push(`${name}: stopped after ${processedFiles} source files or 40 MB of expanded source.`);
          break;
        }
        entries.push(...parseObjectRepositorySource(entryName, strFromU8(bytes)));
        fileNames.push(`${name}/${entryName}`);
        expandedBytes += bytes.length;
        processedFiles += 1;
      }
      if (!processedFiles) warnings.push(`${name}: no supported page object source files found.`);
      continue;
    }
    warnings.push(`${name}: unsupported file type. Use CSV, ZIP, .js, .ts, .java, or .cs.`);
  }

  return { entries: uniqueEntries(entries), fileNames, inputKinds: Array.from(inputKinds), warnings };
}
