import type { TestDataSetRow } from "../types";

export const TEST_DATA_GENERATOR_TEMPLATES = {
  randomNumber: "{{randomNumber:6}}",
  randomString: "{{randomString:8}}",
  aiData: "{{aiData:customer email}}",
  yopmail: "{{yopmail}}",
  date: "{{date:YYYY-MM-DD}}",
  tomorrow: "{{date:YYYY-MM-DD|+1d}}",
  timestamp: "{{date:ISO}}"
} as const;

const GENERATOR_TOKEN_PATTERN = /\{\{\s*(randomNumber|randomString|aiData|oneOf|yopmail|date)(?::([^}]+))?\s*\}\}/gi;
const GENERATOR_ALIAS_PATTERN = /(?<![A-Za-z0-9_])@(?:t\.)?(random|string|randomString|randomNumber|yopmail|today|timestamp)\b/gi;
const GENERATOR_ALIAS_TEMPLATES: Record<string, string> = {
  random: "{{randomString:3}}",
  string: "{{randomString:8}}",
  randomstring: "{{randomString:8}}",
  randomnumber: "{{randomNumber:6}}",
  yopmail: "{{yopmail}}",
  today: "{{date:YYYY-MM-DD}}",
  timestamp: "{{date:ISO}}"
};

function clampLength(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Math.max(1, Math.min(maximum, Number.isFinite(parsed) ? parsed : fallback));
}

function randomCharacters(length: number, alphabet: string) {
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function resolveDate(rawOption: string | undefined, now: Date) {
  const [rawFormat, rawOffset] = String(rawOption || "YYYY-MM-DD").split("|").map((entry) => entry.trim());
  const format = rawFormat || "YYYY-MM-DD";
  const date = new Date(now.getTime());
  const offsetMatch = rawOffset?.match(/^([+-]\d+)\s*([dwmy])$/i);

  if (offsetMatch) {
    const amount = Number.parseInt(offsetMatch[1], 10);
    const unit = offsetMatch[2].toLowerCase();

    if (unit === "d") date.setUTCDate(date.getUTCDate() + amount);
    if (unit === "w") date.setUTCDate(date.getUTCDate() + amount * 7);
    if (unit === "m") date.setUTCMonth(date.getUTCMonth() + amount);
    if (unit === "y") date.setUTCFullYear(date.getUTCFullYear() + amount);
  }

  if (format.toLowerCase() === "iso") {
    return date.toISOString();
  }

  const values: Record<string, string> = {
    YYYY: String(date.getUTCFullYear()),
    MM: String(date.getUTCMonth() + 1).padStart(2, "0"),
    DD: String(date.getUTCDate()).padStart(2, "0"),
    HH: String(date.getUTCHours()).padStart(2, "0"),
    mm: String(date.getUTCMinutes()).padStart(2, "0"),
    ss: String(date.getUTCSeconds()).padStart(2, "0")
  };

  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => values[token]);
}

function generateYopmailAddress(rawPrefix: string | undefined, now: Date) {
  const prefix = String(rawPrefix || "qaira")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "qaira";
  const timestamp = resolveDate("YYYYMMDDHHmmss", now);
  return `${prefix}-${timestamp}-${randomCharacters(6, "abcdefghijklmnopqrstuvwxyz0123456789")}@yopmail.com`;
}

function generateAiData(rawPrompt: string | undefined, now: Date) {
  const prompt = String(rawPrompt || "value").toLowerCase();
  const suffix = randomCharacters(6, "abcdefghijklmnopqrstuvwxyz0123456789");

  if (prompt.includes("email")) {
    return `ai-${resolveDate("YYYYMMDDHHmmss", now)}-${suffix}@yopmail.com`;
  }

  if (prompt.includes("phone") || prompt.includes("mobile")) {
    return `9${randomCharacters(9, "0123456789")}`;
  }

  if (prompt.includes("name")) {
    return `AI User ${suffix.toUpperCase()}`;
  }

  if (prompt.includes("address")) {
    return `${randomCharacters(3, "123456789")} QAira Test Street`;
  }

  return `ai-${suffix}`;
}

function decodeGeneratedValuePool(rawValue: string | undefined) {
  try {
    const base64 = String(rawValue || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const values = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(values) ? values.map((value) => String(value ?? "").trim()).filter(Boolean).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function hasTestDataGeneratorTemplate(value: unknown) {
  GENERATOR_TOKEN_PATTERN.lastIndex = 0;
  GENERATOR_ALIAS_PATTERN.lastIndex = 0;
  const source = String(value ?? "");
  return GENERATOR_TOKEN_PATTERN.test(source) || GENERATOR_ALIAS_PATTERN.test(source);
}

export function evaluateTestDataTemplate(value: unknown, now = new Date()): string {
  GENERATOR_TOKEN_PATTERN.lastIndex = 0;
  GENERATOR_ALIAS_PATTERN.lastIndex = 0;
  const evaluateToken = (_: string, rawKind: string, rawOption: string | undefined) => {
    const kind = rawKind.toLowerCase();
    const option = String(rawOption || "").trim();

    if (kind === "randomnumber") {
      return randomCharacters(clampLength(option, 6, 12), "0123456789");
    }

    if (kind === "randomstring") {
      return randomCharacters(clampLength(option, 8, 32), "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789");
    }

    if (kind === "yopmail") {
      return generateYopmailAddress(option, now);
    }

    if (kind === "aidata") {
      return generateAiData(option, now);
    }

    if (kind === "oneof") {
      const pool = decodeGeneratedValuePool(option);
      return pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";
    }

    return resolveDate(option || "YYYY-MM-DD", now);
  };

  return String(value ?? "")
    .replace(GENERATOR_TOKEN_PATTERN, evaluateToken)
    .replace(GENERATOR_ALIAS_PATTERN, (match: string, rawAlias: string): string =>
      evaluateTestDataTemplate(GENERATOR_ALIAS_TEMPLATES[String(rawAlias || "").toLowerCase()] || match, now)
    );
}

export function materializeTestDataRows(rows: TestDataSetRow[], now = new Date()) {
  return rows.map((row) =>
    Object.entries(row).reduce<TestDataSetRow>((resolved, [key, value]) => {
      resolved[key] = evaluateTestDataTemplate(value, now);
      return resolved;
    }, {})
  );
}

export function countGeneratedTestDataFields(rows: TestDataSetRow[]) {
  return rows.reduce(
    (count, row) => count + Object.values(row).filter((value) => hasTestDataGeneratorTemplate(value)).length,
    0
  );
}
