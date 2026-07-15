import { parseJUnitXmlTestCases } from "./junitImport";
import { parsePostmanCollectionTestCases } from "./postmanImport";
import { parseTestCaseCsv, type ImportedTestCaseRow } from "./testCaseImport";
import { parseTestNgXmlTestCases } from "./testNgImport";

export type TestCaseImportSource = "csv" | "junit_xml" | "testng_xml" | "postman_collection";
export type TestCaseImportSourceSelection = TestCaseImportSource | "auto";

export type PreparedTestCaseImportBatch = {
  id: string;
  fileName: string;
  source: TestCaseImportSource;
  rows: ImportedTestCaseRow[];
  warnings: string[];
};

export const TEST_CASE_IMPORT_SOURCE_OPTIONS: Array<{ value: TestCaseImportSourceSelection; label: string }> = [
  { value: "auto", label: "Auto detect" },
  { value: "csv", label: "CSV" },
  { value: "junit_xml", label: "JUnit XML" },
  { value: "testng_xml", label: "TestNG XML" },
  { value: "postman_collection", label: "Postman collection" }
];

export const getTestCaseImportSourceLabel = (source: TestCaseImportSource) => {
  if (source === "junit_xml") {
    return "JUnit XML";
  }

  if (source === "testng_xml") {
    return "TestNG XML";
  }

  if (source === "postman_collection") {
    return "Postman collection";
  }

  return "CSV";
};

const detectXmlImportSource = (text: string): TestCaseImportSource => {
  const parser = new DOMParser();
  const document = parser.parseFromString(text, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    return "junit_xml";
  }

  const rootTag = document.documentElement.tagName.toLowerCase();

  if (rootTag === "suite" || rootTag === "testng-results") {
    return "testng_xml";
  }

  return "junit_xml";
};

const isLikelyPostmanCollection = (text: string) => {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const info = parsed?.info as Record<string, unknown> | undefined;
    return Boolean((Array.isArray(parsed?.item) && parsed.item.length) || String(info?.schema || "").includes("postman"));
  } catch {
    return false;
  }
};

export const detectTestCaseImportSource = (fileName: string, text: string): TestCaseImportSource => {
  const normalizedFileName = fileName.toLowerCase();
  const trimmed = text.trimStart();

  if (normalizedFileName.endsWith(".csv")) {
    return "csv";
  }

  if (normalizedFileName.endsWith(".postman_collection.json")) {
    return "postman_collection";
  }

  if (normalizedFileName.endsWith(".json")) {
    if (isLikelyPostmanCollection(text)) {
      return "postman_collection";
    }

    throw new Error("Only Postman collection JSON files are supported right now.");
  }

  if (normalizedFileName.endsWith(".xml")) {
    return detectXmlImportSource(text);
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    if (isLikelyPostmanCollection(text)) {
      return "postman_collection";
    }

    throw new Error("Only Postman collection JSON files are supported right now.");
  }

  if (trimmed.startsWith("<")) {
    return detectXmlImportSource(text);
  }

  throw new Error("Unsupported import file. Use CSV, JUnit XML, TestNG XML, or a Postman collection.");
};

export const parseImportedTestCaseSource = (source: TestCaseImportSource, text: string) => {
  if (source === "junit_xml") {
    return parseJUnitXmlTestCases(text);
  }

  if (source === "testng_xml") {
    return parseTestNgXmlTestCases(text);
  }

  if (source === "postman_collection") {
    return parsePostmanCollectionTestCases(text);
  }

  return parseTestCaseCsv(text);
};

export async function prepareTestCaseImportBatch(
  file: File,
  sourceSelection: TestCaseImportSourceSelection
): Promise<PreparedTestCaseImportBatch> {
  const text = await file.text();
  const resolvedSource =
    sourceSelection === "auto"
      ? detectTestCaseImportSource(file.name, text)
      : sourceSelection;
  const parsed = parseImportedTestCaseSource(resolvedSource, text);

  return {
    id: globalThis.crypto?.randomUUID?.() || `import-batch-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fileName: file.name,
    source: resolvedSource,
    rows: parsed.rows,
    warnings: parsed.warnings
  };
}
