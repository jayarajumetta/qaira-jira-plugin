import type { AutomationLearningCacheEntry, SharedStepGroupStep, StepApiRequest, StepApiResponseCapture, StepApiValidation, TestStep, TestStepType } from "../types";

export const STEP_TYPE_OPTIONS: Array<{ value: TestStepType; label: string; shortLabel: string }> = [
  { value: "web", label: "Web", shortLabel: "WEB" },
  { value: "api", label: "API", shortLabel: "API" },
  { value: "android", label: "Android", shortLabel: "AND" },
  { value: "ios", label: "iOS", shortLabel: "IOS" }
];

type StepAutomationLike = Partial<Pick<TestStep, "step_order">> &
  Pick<TestStep, "action" | "expected_result" | "step_type" | "automation_code" | "api_request">;

const STEP_TYPE_SET = new Set<TestStepType>(["web", "api", "android", "ios"]);
const API_METHOD_SET = new Set<NonNullable<StepApiRequest["method"]>>(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const API_BODY_MODE_SET = new Set<NonNullable<StepApiRequest["body_mode"]>>(["none", "json", "text", "xml", "form"]);
const API_AUTH_TYPE_SET = new Set<NonNullable<StepApiRequest["auth"]>["type"]>(["none", "bearer", "api_key", "basic", "oauth2_ref"]);
const API_VALIDATION_OPERATOR_SET = new Set<NonNullable<StepApiValidation["operator"]>>(["eq", "ne", "contains", "matches", "exists", "lt", "lte", "gt", "gte"]);

const normalizeText = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return normalized || "";
};

const normalizeRichText = (value?: string | null) => {
  const normalized = String(value || "").replace(/\r\n/g, "\n");
  return normalized.trim() ? normalized : "";
};

export function normalizeStepType(value?: string | null, fallback: TestStepType = "web"): TestStepType {
  const normalized = String(value || "").trim().toLowerCase() as TestStepType;
  return STEP_TYPE_SET.has(normalized) ? normalized : fallback;
}

export function createEmptyApiRequest(): StepApiRequest {
  return {
    method: "GET",
    url: "",
    headers: [],
    query_params: [],
    cookies: [],
    auth: { type: "none", credential_reference: "", key_name: "Authorization", location: "header" },
    timeout_ms: 30000,
    follow_redirects: true,
    body_mode: "none",
    body: "",
    validations: [{ kind: "status", target: "", expected: "200" }],
    captures: []
  };
}

export function normalizeApiRequest(value?: StepApiRequest | null): StepApiRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const method = String(value.method || "GET").trim().toUpperCase() as NonNullable<StepApiRequest["method"]>;
  const url = normalizeRichText(value.url);
  const bodyMode = String(value.body_mode || "none").trim().toLowerCase() as NonNullable<StepApiRequest["body_mode"]>;
  const body = normalizeRichText(value.body);
  const headers = Array.isArray(value.headers)
    ? value.headers
        .map((header) => ({
          key: normalizeText(header?.key),
          value: normalizeRichText(header?.value)
        }))
        .filter((header) => header.key || header.value)
    : [];
  const normalizeEntries = (entries?: Array<{ key: string; value: string }>) => Array.isArray(entries)
    ? entries.map((entry) => ({ key: normalizeText(entry?.key), value: normalizeRichText(entry?.value) })).filter((entry) => entry.key || entry.value)
    : [];
  const queryParams = normalizeEntries(value.query_params);
  const cookies = normalizeEntries(value.cookies);
  const authType = String(value.auth?.type || "none") as NonNullable<StepApiRequest["auth"]>["type"];
  const auth: NonNullable<StepApiRequest["auth"]> = {
    type: API_AUTH_TYPE_SET.has(authType) ? authType : "none",
    credential_reference: normalizeText(value.auth?.credential_reference),
    key_name: normalizeText(value.auth?.key_name) || "Authorization",
    location: value.auth?.location === "query" ? "query" : "header"
  };
  const validations = Array.isArray(value.validations)
    ? value.validations
        .map((validation) => ({
          kind: normalizeValidationKind(validation?.kind),
          operator: normalizeValidationOperator(validation?.operator),
          target: normalizeRichText(validation?.target),
          expected: normalizeRichText(validation?.expected)
        }))
        .filter((validation) => validation.kind === "status" || validation.target || validation.expected)
    : [];
  const captures = Array.isArray(value.captures)
    ? value.captures
        .map((capture) => ({
          path: normalizeRichText(capture?.path),
          parameter: normalizeRichText(capture?.parameter)
        }))
        .filter((capture) => capture.path && capture.parameter)
    : [];

  if (!url && !headers.length && !queryParams.length && !cookies.length && !body && !validations.length && !captures.length) {
    return null;
  }

  return {
    method: API_METHOD_SET.has(method) ? method : "GET",
    url,
    headers,
    query_params: queryParams,
    cookies,
    auth,
    timeout_ms: Math.max(1000, Math.min(120000, Number(value.timeout_ms || 30000))),
    follow_redirects: value.follow_redirects !== false,
    body_mode: API_BODY_MODE_SET.has(bodyMode) ? bodyMode : "none",
    body,
    validations,
    captures
  };
}

export function ensureApiRequest(value?: StepApiRequest | null): StepApiRequest {
  return normalizeApiRequest(value) || createEmptyApiRequest();
}

export function normalizeAutomationCode(value?: string | null) {
  return normalizeRichText(value);
}

export function stepHasAutomation(step: StepAutomationLike | SharedStepGroupStep) {
  return Boolean(normalizeRichText(step.automation_code) || normalizeApiRequest(step.api_request));
}

function quoteJsString(value: string) {
  return JSON.stringify(value);
}

function indentBlock(value: string, depth = 2) {
  const indentation = " ".repeat(depth);
  return value
    .split("\n")
    .map((line) => (line ? `${indentation}${line}` : line))
    .join("\n");
}

function normalizeValidationKind(value?: string | null): StepApiValidation["kind"] {
  const normalized = String(value || "").trim().toLowerCase();
  if (["header", "header_present", "body_contains", "body_not_contains", "json_path", "json_schema", "response_time"].includes(normalized)) {
    return normalized as StepApiValidation["kind"];
  }
  return "status";
}

function normalizeValidationOperator(value?: string | null): NonNullable<StepApiValidation["operator"]> {
  const normalized = String(value || "eq").trim().toLowerCase() as NonNullable<StepApiValidation["operator"]>;
  return API_VALIDATION_OPERATOR_SET.has(normalized) ? normalized : "eq";
}

function toJsAssertionLiteral(value?: string | null) {
  const normalized = normalizeRichText(value);

  if (!normalized) {
    return quoteJsString("");
  }

  if (normalized === "true" || normalized === "false" || normalized === "null") {
    return normalized;
  }

  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return normalized;
  }

  if (/^[\[{"]/.test(normalized)) {
    try {
      return JSON.stringify(JSON.parse(normalized));
    } catch {
      return quoteJsString(normalized);
    }
  }

  return quoteJsString(normalized);
}

export function buildApiValidationAssertionCode(validation: StepApiValidation, responseVar: string) {
  const target = normalizeRichText(validation.target);
  const expected = normalizeRichText(validation.expected);

  switch (normalizeValidationKind(validation.kind)) {
    case "header_present":
      return `expect(${responseVar}.headers[${quoteJsString(target || "content-type")}]).toBeDefined();`;
    case "header":
      return `expect(${responseVar}.headers[${quoteJsString(target || "content-type")}]).toBe(${quoteJsString(expected || "")});`;
    case "body_not_contains":
      return `expect(String(${responseVar}.body)).not.toContain(${quoteJsString(expected || "")});`;
    case "body_contains":
      return `expect(String(${responseVar}.body)).toContain(${quoteJsString(expected || "")});`;
    case "json_schema":
      return `expect(validateJsonSchema(${responseVar}.body, ${toJsAssertionLiteral(expected || target)})).toEqual({ valid: true });`;
    case "response_time":
      return `expect(${responseVar}.durationMs).toBeLessThanOrEqual(${Number(expected || target) || 2000});`;
    case "json_path":
      return `expect(readJsonPath(${responseVar}.body, ${quoteJsString(target || "$")})).toEqual(${toJsAssertionLiteral(expected)});`;
    case "status":
    default:
      return `expect(${responseVar}.status).toBe(${Number(expected) || 200});`;
  }
}

function buildApiRequestLiteral(request: StepApiRequest) {
  const headerLines = (request.headers || []).map((header) => `${quoteJsString(header.key)}: ${quoteJsString(header.value)}`);
  const lines = [
    `method: ${quoteJsString(String(request.method || "GET"))},`,
    `url: ${quoteJsString(request.url || "")},`
  ];

  if (headerLines.length) {
    lines.push("headers: {");
    lines.push(...headerLines.map((line) => `  ${line},`));
    lines.push("},");
  }

  if (request.query_params?.length) lines.push(`query: ${JSON.stringify(Object.fromEntries(request.query_params.map((entry) => [entry.key, entry.value])))},`);
  if (request.cookies?.length) lines.push(`cookies: ${JSON.stringify(Object.fromEntries(request.cookies.map((entry) => [entry.key, entry.value])))},`);
  if (request.auth?.type && request.auth.type !== "none") {
    lines.push(`auth: { type: ${quoteJsString(request.auth.type)}, credentialReference: ${quoteJsString(request.auth.credential_reference || "")} },`);
  }
  lines.push(`timeoutMs: ${Number(request.timeout_ms || 30000)},`);
  lines.push(`followRedirects: ${request.follow_redirects !== false},`);

  if ((request.body_mode || "none") !== "none" && normalizeRichText(request.body)) {
    lines.push(`bodyMode: ${quoteJsString(String(request.body_mode || "text"))},`);
    lines.push(`body: ${quoteJsString(request.body || "")},`);
  }

  return `{\n${indentBlock(lines.join("\n"), 2)}\n}`;
}

function buildApiResponseCaptureCode(capture: StepApiResponseCapture, responseVar: string, index: number) {
  const path = normalizeRichText(capture.path) || "$";
  const parameter = normalizeRichText(capture.parameter) || `@t.capture_${index + 1}`;
  const captureVar = `capture${index + 1}_${parameter.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+/, "") || "value"}`;

  return [
    `const ${captureVar} = readJsonPath(${responseVar}.body, ${quoteJsString(path)});`,
    `// Store ${captureVar} as ${parameter} for downstream steps.`
  ].join("\n");
}

function buildGeneratedApiCode(step: StepAutomationLike, request: StepApiRequest) {
  const stepLabel = `Step ${step.step_order || 1}`;
  const responseVar = `response${step.step_order || 1}`;
  const validationLines = (request.validations || []).map((validation) => buildApiValidationAssertionCode(validation, responseVar));
  const captureLines = (request.captures || []).flatMap((capture, index) => buildApiResponseCaptureCode(capture, responseVar, index).split("\n"));
  const comments = [
    normalizeText(step.action) ? `// Action: ${normalizeText(step.action)}` : "",
    normalizeText(step.expected_result) ? `// Expected: ${normalizeText(step.expected_result)}` : ""
  ].filter(Boolean);

  return [
    ...comments,
    `const ${responseVar} = await api.request(${buildApiRequestLiteral(request)});`,
    ...captureLines,
    ...(validationLines.length ? validationLines : [`expect(${responseVar}.status).toBe(200);`]),
    `// ${stepLabel}`
  ].join("\n");
}

function buildGeneratedUiCode(step: StepAutomationLike, stepType: TestStepType) {
  const scope = stepType === "android" ? "android" : stepType === "ios" ? "ios" : "web";
  const title = normalizeText(step.action) || `Step ${step.step_order || 1}`;
  const expected = normalizeText(step.expected_result);

  if (scope === "web") {
    return [
      `// Playwright-style QAira runtime: page, expect, web, params, and capture are provided by the engine.`,
      `await web.step(${quoteJsString(title)}, async () => {`,
      `  // TODO: replace the locator with an Object Repository field or stable Playwright locator.`,
      `  // Example: await page.locator("Login.Email").fill("@t.email");`,
      `  // Example: await expect(page.locator("Login.Submit")).toBeVisible();`,
      normalizeText(step.action) ? `  // Action: ${normalizeText(step.action)}` : "",
      expected ? `  // Expected: ${expected}` : "",
      "});"
    ].filter(Boolean).join("\n");
  }

  return [
    `// Appium/WebdriverIO runtime: driver is the active ${scope === "ios" ? "iOS" : "Android"} session.`,
    `await ${scope}.step(${quoteJsString(title)}, async () => {`,
    `  // TODO: replace the selector with an accessibility id, UiAutomator selector, XPath, or stable native locator.`,
    `  // Example: const element = await driver.$("~Login");`,
    `  // Example: await element.click();`,
    normalizeText(step.action) ? `  // Action: ${normalizeText(step.action)}` : "",
    expected ? `  // Expected: ${expected}` : "",
    "});"
  ].filter(Boolean).join("\n");
}

export function resolveStepAutomationCode(step: StepAutomationLike) {
  const stepType = normalizeStepType(step.step_type);
  const customCode = normalizeAutomationCode(step.automation_code);

  if (customCode) {
    return customCode;
  }

  if (stepType === "api") {
    return buildGeneratedApiCode(step, ensureApiRequest(step.api_request));
  }

  return buildGeneratedUiCode(step, stepType);
}

export function buildGroupAutomationCode(name: string, steps: Array<StepAutomationLike | SharedStepGroupStep>) {
  const groupName = normalizeText(name) || "Step group";
  const blocks = steps.map((step, index) =>
    `// ${groupName} · Step ${index + 1}\n${resolveStepAutomationCode({
      step_order: "step_order" in step && typeof step.step_order === "number" ? step.step_order : index + 1,
      action: step.action,
      expected_result: step.expected_result,
      step_type: step.step_type,
      automation_code: step.automation_code,
      api_request: step.api_request
    })}`
  );

  return [`// Group: ${groupName}`, ...blocks].join("\n\n");
}

export function buildCaseAutomationCode(title: string, steps: Array<StepAutomationLike | SharedStepGroupStep>) {
  const caseTitle = normalizeText(title) || "Test case";
  const blocks = steps.map((step, index) =>
    `// Step ${index + 1}\n${resolveStepAutomationCode({
      step_order: "step_order" in step && typeof step.step_order === "number" ? step.step_order : index + 1,
      action: step.action,
      expected_result: step.expected_result,
      step_type: step.step_type,
      automation_code: step.automation_code,
      api_request: step.api_request
    })}`
  );

  return [`// Test case: ${caseTitle}`, ...blocks].join("\n\n");
}

export type AutomationKeywordMapping = {
  id: string;
  keyword: string;
  target: string;
  displayTarget: string;
  value?: string;
  objectName?: string;
  screenName?: string;
  locatorKind?: string | null;
};

const CODE_CALL_PATTERN = /\b(web|android|ios)\.([A-Za-z][A-Za-z0-9_]*)\(([^)]*)\)/g;
const PAGE_LOCATOR_DECLARATION_PATTERN = /const\s+([A-Za-z_$][\w$]*)\s*=\s*page\.(locator|getByLabel|getByPlaceholder|getByText)\(([^)]*)\);([\s\S]*?)(?=\n\s*\}|$)/g;
const PAGE_EXPECT_PATTERN = /\bexpect\(\s*page\.(locator|getByLabel|getByPlaceholder|getByText)\(([^)]*)\)\s*\)\.(toBeVisible|toContainText|toHaveText|toHaveValue)\(([^)]*)\)/g;
const DRIVER_ELEMENT_DECLARATION_PATTERN = /const\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+driver\.\$\(([^)]*)\);([\s\S]*?)(?=\n\s*\}|$)/g;

function splitCallArguments(source: string) {
  const values: string[] = [];
  let current = "";
  let quote: "\"" | "'" | "`" | null = null;
  let escaped = false;

  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && quote) {
      current += char;
      escaped = true;
      continue;
    }

    if ((char === "\"" || char === "'" || char === "`") && (!quote || quote === char)) {
      quote = quote ? null : char;
      current += char;
      continue;
    }

    if (!quote && char === ",") {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    values.push(current.trim());
  }

  return values;
}

function unquoteCallArgument(value: string) {
  const trimmed = value.trim();
  if (/^["'`].*["'`]$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function resolveObjectForLocator(locator: string, repository: AutomationLearningCacheEntry[] = []) {
  const normalized = locator.trim();
  return repository.find((entry) => entry.locator === normalized)
    || repository.find((entry) => entry.locator && normalized.includes(entry.locator));
}

function readRepositoryText(entry: AutomationLearningCacheEntry | undefined, key: string) {
  const value = entry?.metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function buildAutomationKeywordMappings(code: string, repository: AutomationLearningCacheEntry[] = []): AutomationKeywordMapping[] {
  const mappings: AutomationKeywordMapping[] = [];
  const normalizedCode = normalizeAutomationCode(code);
  let match: RegExpExecArray | null;
  const pushMapping = (input: { index: number; keyword: string; target: string; value?: string }) => {
    const entry = resolveObjectForLocator(input.target, repository);
    const objectName = readRepositoryText(entry, "object_name") || entry?.locator_intent || "";
    const displayTarget = objectName || input.target || "(no target)";

    mappings.push({
      id: `${input.index}:${input.keyword}:${input.target}:${input.value || ""}`,
      keyword: input.keyword,
      target: input.target,
      displayTarget,
      value: input.value || "",
      objectName: objectName || undefined,
      screenName: readRepositoryText(entry, "screen_name") || entry?.page_key || undefined,
      locatorKind: entry?.locator_kind || entry?.source || null
    });
  };

  while ((match = CODE_CALL_PATTERN.exec(normalizedCode))) {
    const [, scope, method, argsSource] = match;
    const args = splitCallArguments(argsSource || "").map(unquoteCallArgument);
    const target = args[0] || "";
    const value = args[1] || "";
    pushMapping({
      index: match.index,
      keyword: `${scope}.${method}`,
      target,
      value
    });
  }

  while ((match = PAGE_LOCATOR_DECLARATION_PATTERN.exec(normalizedCode))) {
    const [, variableName, locatorMethod, targetSource, blockSource] = match;
    const target = unquoteCallArgument(splitCallArguments(targetSource || "")[0] || "");
    const callPattern = new RegExp(`\\b${variableName}\\.(click|fill|press|hover|dblclick|selectOption|check|uncheck|textContent|inputValue)\\(([^)]*)\\)`, "g");
    let callMatch: RegExpExecArray | null;

    while ((callMatch = callPattern.exec(blockSource || ""))) {
      const [, method, argsSource] = callMatch;
      const args = splitCallArguments(argsSource || "").map(unquoteCallArgument);
      pushMapping({
        index: match.index + callMatch.index,
        keyword: `playwright.${locatorMethod}.${method}`,
        target,
        value: args[0] || ""
      });
    }
  }

  while ((match = PAGE_EXPECT_PATTERN.exec(normalizedCode))) {
    const [, locatorMethod, targetSource, method, argsSource] = match;
    const target = unquoteCallArgument(splitCallArguments(targetSource || "")[0] || "");
    const args = splitCallArguments(argsSource || "").map(unquoteCallArgument);
    pushMapping({
      index: match.index,
      keyword: `playwright.expect.${method}`,
      target,
      value: args[0] || ""
    });
  }

  while ((match = DRIVER_ELEMENT_DECLARATION_PATTERN.exec(normalizedCode))) {
    const [, variableName, targetSource, blockSource] = match;
    const target = unquoteCallArgument(splitCallArguments(targetSource || "")[0] || "");
    const callPattern = new RegExp(`\\b${variableName}\\.(click|setValue|clearValue|waitForDisplayed|waitForExist|getText|getAttribute|isEnabled|isDisplayed)\\(([^)]*)\\)`, "g");
    let callMatch: RegExpExecArray | null;

    while ((callMatch = callPattern.exec(blockSource || ""))) {
      const [, method, argsSource] = callMatch;
      const args = splitCallArguments(argsSource || "").map(unquoteCallArgument);
      pushMapping({
        index: match.index + callMatch.index,
        keyword: `webdriverio.${method}`,
        target,
        value: args[0] || ""
      });
    }
  }

  return mappings;
}

export function getStepTypeMeta(value?: string | null) {
  const type = normalizeStepType(value);
  return STEP_TYPE_OPTIONS.find((option) => option.value === type) || STEP_TYPE_OPTIONS[0];
}
