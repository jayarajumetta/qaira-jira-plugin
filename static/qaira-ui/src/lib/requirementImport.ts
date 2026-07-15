import { parseCsvGrid } from "./csvGrid";

export type ImportedRequirementRow = {
  title: string;
  description?: string;
  external_references?: string[];
  labels?: string[];
  sprint?: string;
  fix_version?: string;
  release?: string;
  iteration_id?: string;
  linked_test_cases?: string;
  linked_bugs?: string;
  priority?: number;
  status?: string;
};

type ParsedCsv = {
  headers: string[];
  rows: ImportedRequirementRow[];
  warnings: string[];
};

const HEADER_ALIASES: Record<keyof ImportedRequirementRow, string[]> = {
  title: ["title", "requirement", "requirementtitle", "name", "summary"],
  description: ["description", "details", "notes", "acceptancecriteria", "story"],
  external_references: ["externalreferences", "externalreference", "references", "reference", "externallinks", "externaltickets", "ticketlinks", "tickets", "jira", "issue", "issues"],
  labels: ["labels", "label", "tags", "tag"],
  sprint: ["sprint", "iteration"],
  fix_version: ["fixversion", "fixversions", "targetversion", "version"],
  release: ["release", "releaseversion", "targetrelease"],
  iteration_id: ["iterationid", "requirementiteration", "iterationname"],
  linked_test_cases: ["linkedtestcases", "testcaseids", "testcases", "linkedtests"],
  linked_bugs: ["linkedbugs", "bugids", "bugs", "defects"],
  priority: ["priority", "severity"],
  status: ["status", "state"]
};

const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");
const parseReferenceList = (value: string) =>
  Array.from(new Set(value.split(/,|\r?\n|\|/).map((item) => item.trim()).filter(Boolean)));

const findCanonicalKey = (header: string) => {
  const normalized = normalizeHeader(header);

  return (Object.entries(HEADER_ALIASES) as Array<[keyof ImportedRequirementRow, string[]]>).find(([, aliases]) =>
    aliases.includes(normalized)
  )?.[0];
};

export function parseRequirementCsv(text: string): ParsedCsv {
  const grid = parseCsvGrid(text);

  if (!grid.length) {
    return {
      headers: [],
      rows: [],
      warnings: ["The CSV file is empty."]
    };
  }

  const headers = grid[0];
  const headerMap = headers.map((header) => findCanonicalKey(header));
  const rows = grid.slice(1);
  const warnings: string[] = [];

  if (!headerMap.includes("title")) {
    warnings.push("A title column is required. Supported aliases include Title, Requirement, or Summary.");
  }

  const normalizedRows = rows
    .map((row) =>
      row.reduce<Partial<ImportedRequirementRow>>((accumulator, value, index) => {
        const key = headerMap[index];

        if (!key || !value.trim()) {
          return accumulator;
        }

        if (key === "priority") {
          const parsed = Number(value);
          accumulator.priority = Number.isFinite(parsed) ? parsed : undefined;
          return accumulator;
        }

        if (key === "external_references") {
          accumulator.external_references = parseReferenceList(value);
          return accumulator;
        }

        if (key === "labels") {
          accumulator.labels = parseReferenceList(value);
          return accumulator;
        }

        accumulator[key] = value.trim() as never;
        return accumulator;
      }, {})
    )
    .filter((row): row is ImportedRequirementRow => Boolean(row.title?.trim()));

  if (!normalizedRows.length && rows.length) {
    warnings.push("No valid rows were found. Every imported row must include a requirement title.");
  }

  return {
    headers,
    rows: normalizedRows,
    warnings
  };
}
