import { normalizeApiRequest } from "./stepAutomation";
import type { ImportedTestCaseRow, ImportedTestCaseStep } from "./testCaseImport";
import type { StepApiRequest } from "../types";

type ParsedPostmanCollection = {
  rows: ImportedTestCaseRow[];
  warnings: string[];
};

type PostmanVariable = {
  key?: string;
  id?: string;
  value?: unknown;
};

type PostmanRequestLike = {
  method?: string;
  url?: string | {
    raw?: string;
    protocol?: string;
    host?: string[] | string;
    path?: string[] | string;
    query?: Array<{ key?: string; value?: string; disabled?: boolean }>;
  };
  header?: Array<{ key?: string; value?: string; disabled?: boolean }>;
  body?: {
    mode?: string;
    raw?: string;
    options?: {
      raw?: {
        language?: string;
      };
    };
    urlencoded?: Array<{ key?: string; value?: string; disabled?: boolean }>;
    formdata?: Array<{ key?: string; value?: string; disabled?: boolean; type?: string }>;
  };
};

type PostmanUrlLike = NonNullable<PostmanRequestLike["url"]>;

const SUPPORTED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeParameterName = (value: string) =>
  value
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

const replacePostmanVariables = (value?: string | null) =>
  String(value || "").replace(VARIABLE_PATTERN, (_, name: string) => `@${normalizeParameterName(name)}`);

const normalizePostmanRequest = (value: unknown): PostmanRequestLike | null => {
  if (typeof value === "string") {
    return {
      method: "GET",
      url: value
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as PostmanRequestLike;
};

const collectReferencedVariables = (value?: string | null) => {
  const source = String(value || "");
  const matches = source.matchAll(VARIABLE_PATTERN);

  return Array.from(matches).reduce<string[]>((next, match) => {
    const name = normalizeParameterName(match[1] || "");

    if (name && !next.includes(name)) {
      next.push(name);
    }

    return next;
  }, []);
};

const readVariableMap = (variables?: PostmanVariable[]) =>
  Array.isArray(variables)
    ? variables.reduce<Record<string, string>>((next, variable) => {
        const name = normalizeParameterName(String(variable?.key || variable?.id || ""));

        if (!name) {
          return next;
        }

        next[name] = variable?.value === undefined || variable?.value === null ? "" : String(variable.value);
        return next;
      }, {})
    : {};

const joinSegments = (value?: string[] | string) => {
  if (Array.isArray(value)) {
    return value.join("/");
  }

  return String(value || "");
};

const removeQueryAndHash = (value: string) => value.split(/[?#]/)[0] || "";

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripHostLikeLeadingSegment = (segments: string[]) => {
  const [firstSegment] = segments;

  if (
    segments.length > 1
    && firstSegment
    && (firstSegment === "qaira-variable" || firstSegment.includes(".") || firstSegment.startsWith("@"))
  ) {
    return segments.slice(1);
  }

  return segments;
};

const getPathSegmentsFromRawUrl = (value: string) => {
  const normalized = replacePostmanVariables(removeQueryAndHash(value).trim());

  if (!normalized) {
    return [];
  }

  try {
    const parsedUrl = new URL(normalized.replace(/@([a-z0-9_.-]+)/gi, "qaira-variable"), "https://qaira.local");
    return stripHostLikeLeadingSegment(parsedUrl.pathname.split("/").filter(Boolean));
  } catch {
    const segments = normalized
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .split("/")
      .filter(Boolean);
    return stripHostLikeLeadingSegment(segments);
  }
};

const getRequestPathSegments = (url?: PostmanUrlLike) => {
  if (typeof url === "string") {
    return getPathSegmentsFromRawUrl(url);
  }

  if (!url || typeof url !== "object") {
    return [];
  }

  const pathSegments = Array.isArray(url.path)
    ? url.path
    : String(url.path || "").split("/");

  const normalizedPathSegments = pathSegments
    .map((segment) => replacePostmanVariables(String(segment || "")).trim())
    .filter(Boolean);

  if (normalizedPathSegments.length) {
    return normalizedPathSegments;
  }

  return url.raw ? getPathSegmentsFromRawUrl(url.raw) : [];
};

const humanizePathSegment = (segment: string, index: number, segments: string[]) => {
  const normalized = safeDecodeURIComponent(segment)
    .replace(/^:+/, "")
    .replace(/^@+/, "")
    .replace(/[{}]/g, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

  if (!normalized) {
    return index === segments.length - 1 ? "Endpoint" : "";
  }

  const isLikelyIdentifier =
    /^@/.test(segment) ||
    /^:/.test(segment) ||
    /^\{.*\}$/.test(segment) ||
    /\bid\b/i.test(normalized) ||
    /^[0-9a-f]{8,}$/i.test(normalized) ||
    /^\d+$/.test(normalized);

  if (isLikelyIdentifier) {
    return "Id";
  }

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const buildHumanizedPathTitle = (segments: string[]) =>
  segments.reduce<string[]>((parts, segment, index) => {
    const humanizedSegment = humanizePathSegment(segment, index, segments);

    if (!humanizedSegment) {
      return parts;
    }

    if (humanizedSegment === "Id" && parts.length) {
      const previousPart = parts.pop() || "";
      const singularBase = previousPart.replace(/s$/i, "");
      parts.push(`${singularBase} By Id`);
      return parts;
    }

    parts.push(humanizedSegment);
    return parts;
  }, []).join(" ");

const getMethodVerb = (method: string) => {
  switch (method) {
    case "POST":
      return "Create";
    case "PUT":
    case "PATCH":
      return "Update";
    case "DELETE":
      return "Delete";
    case "HEAD":
      return "Check";
    case "OPTIONS":
      return "Inspect";
    case "GET":
    default:
      return "Get";
  }
};

const buildSmartRequestTitle = (request: PostmanRequestLike, fallbackName: string) => {
  const method = String(request.method || "GET").trim().toUpperCase();
  const pathSegments = getRequestPathSegments(request.url);
  const filteredPathSegments = pathSegments
    .filter((segment) => !/^https?:$/i.test(segment))
    .filter((segment) => !/^(api|rest|graphql|v\d+)$/i.test(segment));
  const meaningfulSegments = (filteredPathSegments.length ? filteredPathSegments : pathSegments).slice(-3);
  const pathTitle = buildHumanizedPathTitle(meaningfulSegments);

  return collapseWhitespace(`${getMethodVerb(method)} ${pathTitle || fallbackName || "API Request"}`);
};

const resolveRequestUrl = (url?: PostmanRequestLike["url"]) => {
  if (typeof url === "string") {
    return url;
  }

  if (!url || typeof url !== "object") {
    return "";
  }

  if (url.raw) {
    return url.raw;
  }

  const protocol = collapseWhitespace(String(url.protocol || ""));
  const host = joinSegments(url.host);
  const path = joinSegments(url.path);
  const base = [protocol ? `${protocol}://` : "", host, path ? `/${path}` : ""].join("");
  const query = Array.isArray(url.query)
    ? url.query
        .filter((entry) => !entry?.disabled && entry?.key)
        .map((entry) => `${entry?.key}=${entry?.value || ""}`)
        .join("&")
    : "";

  return query ? `${base}?${query}` : base;
};

const resolveRequestBody = (
  request: PostmanRequestLike
): { body_mode: NonNullable<StepApiRequest["body_mode"]>; body: string } => {
  const mode = String(request.body?.mode || "none").toLowerCase();

  if (mode === "raw") {
    const raw = String(request.body?.raw || "");
    const language = String(request.body?.options?.raw?.language || "").toLowerCase();
    const bodyMode: StepApiRequest["body_mode"] =
      language === "json" ? "json" : language === "xml" ? "xml" : "text";

    return {
      body_mode: bodyMode,
      body: replacePostmanVariables(raw)
    };
  }

  if (mode === "urlencoded") {
    const body = Array.isArray(request.body?.urlencoded)
      ? request.body.urlencoded
          .filter((entry) => !entry?.disabled && entry?.key)
          .map((entry) => `${entry?.key}=${entry?.value || ""}`)
          .join("&")
      : "";

    return {
      body_mode: body ? "form" : "none",
      body: replacePostmanVariables(body)
    };
  }

  if (mode === "formdata") {
    const body = Array.isArray(request.body?.formdata)
      ? request.body.formdata
          .filter((entry) => !entry?.disabled && entry?.key)
          .map((entry) => `${entry?.key}=${entry?.value || ""}`)
          .join("&")
      : "";

    return {
      body_mode: body ? "form" : "none",
      body: replacePostmanVariables(body)
    };
  }

  return {
    body_mode: "none" as const,
    body: ""
  };
};

const buildApiRequest = (request: PostmanRequestLike): StepApiRequest => {
  const method = String(request.method || "GET").trim().toUpperCase();
  const url = replacePostmanVariables(resolveRequestUrl(request.url));
  const headers = Array.isArray(request.header)
    ? request.header
        .filter((header) => !header?.disabled && header?.key)
        .map((header) => ({
          key: String(header?.key || "").trim(),
          value: replacePostmanVariables(String(header?.value || ""))
        }))
    : [];
  const body = resolveRequestBody(request);

  const fallbackRequest: StepApiRequest = {
    method: "GET",
    url,
    headers,
    body_mode: body.body_mode as StepApiRequest["body_mode"],
    body: body.body,
    validations: [{ kind: "status", target: "", expected: "200" }]
  };

  return normalizeApiRequest({
    method: SUPPORTED_METHODS.has(method) ? (method as StepApiRequest["method"]) : "GET",
    url,
    headers,
    body_mode: body.body_mode,
    body: body.body,
    validations: [{ kind: "status", target: "", expected: "200" }]
  }) || fallbackRequest;
};

const buildPostmanStep = (requestName: string, request: PostmanRequestLike): ImportedTestCaseStep => {
  const apiRequest = buildApiRequest(request);

  return {
    step_order: 1,
    step_type: "api",
    action: `Send ${apiRequest.method || "GET"} request for ${requestName}.`,
    expected_result: "The API responds successfully for this request.",
    api_request: apiRequest
  };
};

const collectRequestVariables = (request: PostmanRequestLike) => {
  const apiRequest = buildApiRequest(request);
  const variableNames = [
    ...collectReferencedVariables(apiRequest.url),
    ...collectReferencedVariables(apiRequest.body),
    ...(apiRequest.headers || []).flatMap((header) => collectReferencedVariables(header.value))
  ];

  return Array.from(new Set(variableNames));
};

const collectItems = (
  items: Array<Record<string, unknown>>,
  collectionName: string,
  inheritedVariables: Record<string, string>,
  folderPath: string[]
) => {
  const rows: ImportedTestCaseRow[] = [];
  const warnings: string[] = [];

  items.forEach((item, index) => {
    const itemName = collapseWhitespace(String(item?.name || "")) || `Request ${index + 1}`;
    const localVariables = {
      ...inheritedVariables,
      ...readVariableMap(Array.isArray(item?.variable) ? (item.variable as PostmanVariable[]) : [])
    };

    if (Array.isArray(item?.item)) {
      const nested = collectItems(item.item as Array<Record<string, unknown>>, collectionName, localVariables, [...folderPath, itemName]);
      rows.push(...nested.rows);
      warnings.push(...nested.warnings);
      return;
    }

    const request = normalizePostmanRequest(item?.request);

    if (!request) {
      warnings.push(`Skipped "${itemName}" because it does not contain a request payload.`);
      return;
    }

    const testCaseTitle = buildSmartRequestTitle(request, itemName);
    const step = buildPostmanStep(testCaseTitle, request);
    const parameterValues = collectRequestVariables(request).reduce<Record<string, string>>((next, name) => {
      next[name] = localVariables[name] || "";
      return next;
    }, {});

    rows.push({
      title: testCaseTitle,
      description: collapseWhitespace(
        [
          "Imported from a Postman collection.",
          `Collection: ${collectionName}.`,
          folderPath.length ? `Folder: ${folderPath.join(" / ")}.` : "",
          `Method: ${String(step.api_request?.method || "GET").toUpperCase()}.`,
          itemName !== testCaseTitle ? `Postman item: ${itemName}.` : ""
        ].filter(Boolean).join(" ")
      ),
      automated: "yes",
      status: "draft",
      suite: collectionName,
      parameter_values: parameterValues,
      steps: [step]
    });
  });

  return { rows, warnings };
};

export function parsePostmanCollectionTestCases(text: string): ParsedPostmanCollection {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      rows: [],
      warnings: ["The selected file is not valid JSON, so it could not be parsed as a Postman collection."]
    };
  }

  const info = parsed?.info as Record<string, unknown> | undefined;
  const schema = String(info?.schema || "");
  const collectionName = collapseWhitespace(String(info?.name || "")) || "Postman collection";

  if (!schema.includes("postman") && !Array.isArray(parsed?.item)) {
    return {
      rows: [],
      warnings: ["The JSON file does not look like a Postman collection export."]
    };
  }

  const topLevelItems = Array.isArray(parsed?.item) ? (parsed.item as Array<Record<string, unknown>>) : [];

  if (!topLevelItems.length) {
    return {
      rows: [{
        title: collectionName,
        description: "Imported from a Postman collection with no request items yet. Add API steps after import.",
        suite: collectionName,
        automated: "yes",
        priority: 3,
        status: "draft",
        steps: []
      }],
      warnings: ["No requests were found in the selected Postman collection, so an editable draft case was prepared."]
    };
  }

  const collectionVariables = readVariableMap(Array.isArray(parsed?.variable) ? (parsed.variable as PostmanVariable[]) : []);
  const { rows, warnings } = collectItems(topLevelItems, collectionName, collectionVariables, []);

  if (!rows.length) {
    return {
      rows: [{
        title: collectionName,
        description: "Imported from a Postman collection without importable request items. Add API steps after import.",
        suite: collectionName,
        automated: "yes",
        priority: 3,
        status: "draft",
        steps: []
      }],
      warnings: warnings.length ? warnings : ["No importable requests were found in the selected Postman collection, so an editable draft case was prepared."]
    };
  }

  return {
    rows,
    warnings
  };
}
