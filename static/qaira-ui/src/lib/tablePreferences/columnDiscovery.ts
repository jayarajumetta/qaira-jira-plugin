export type DiscoveredColumn = {
  dataType: "boolean" | "date" | "list" | "number" | "text";
  description: string;
  group: string;
  key: string;
  label: string;
};

const INTERNAL_FIELD_NAMES = new Set([
  "_links",
  "actions",
  "children",
  "fields",
  "raw",
  "rawfields",
  "selection",
  "select",
  "spec",
  "token"
]);

const SENSITIVE_FIELD_PATTERN = /(authorization|credential|password|secret|access.?token|refresh.?token|api.?key)/i;
const DATE_FIELD_PATTERN = /(^|_)(at|date|time|timestamp)$/i;

export const canonicalColumnKey = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();

export const humanizeColumnKey = (key: string) => {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (["ai", "api", "id", "jql", "llm", "rag", "sla", "url"].includes(lower)) {
        return lower.toUpperCase();
      }
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
};

const isDisplayableValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }
  return Array.isArray(value) && value.every((entry) => ["string", "number", "boolean"].includes(typeof entry));
};

const inferDataType = (key: string, values: unknown[]): DiscoveredColumn["dataType"] => {
  const value = values.find(isDisplayableValue);
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string" && (DATE_FIELD_PATTERN.test(key) || /^\d{4}-\d{2}-\d{2}T/.test(value))) return "date";
  return "text";
};

export const discoverRowColumns = <T>(rows: T[], declaredKeys: string[]): DiscoveredColumn[] => {
  const declaredCanonicalKeys = new Set(declaredKeys.map(canonicalColumnKey));
  const samples = rows.slice(0, 80).filter((row): row is T & Record<string, unknown> => Boolean(row) && typeof row === "object");
  const candidateKeys = [...new Set(samples.flatMap((row) => Object.keys(row)))];

  return candidateKeys
    .filter((key) => {
      const canonicalKey = canonicalColumnKey(key);
      if (!canonicalKey || declaredCanonicalKeys.has(canonicalKey) || INTERNAL_FIELD_NAMES.has(canonicalKey)) return false;
      if (key.startsWith("_") || SENSITIVE_FIELD_PATTERN.test(key)) return false;
      return samples.some((row) => isDisplayableValue(row[key]));
    })
    .sort((left, right) => humanizeColumnKey(left).localeCompare(humanizeColumnKey(right)))
    .map((key) => {
      const label = humanizeColumnKey(key);
      return {
        dataType: inferDataType(key, samples.map((row) => row[key])),
        description: `${label} supplied by this feature's current project-scoped data model.`,
        group: "Additional fields",
        key,
        label
      };
    });
};

export const formatDiscoveredValue = (value: unknown, dataType: DiscoveredColumn["dataType"]) => {
  if (value === null || value === undefined || value === "") return "—";
  if (dataType === "boolean") return value ? "Yes" : "No";
  if (dataType === "list" && Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (dataType === "date" && typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
  }
  return String(value);
};
