import type { ExecutionDataSetSnapshot, TestStep } from "../types";

export type StepParameterScope = "t" | "s" | "r";

export type StepParameterDefinition = {
  name: string;
  rawName: string;
  label: string;
  token: string;
  scope: StepParameterScope;
  scopeLabel: string;
  stepIds: string[];
  occurrenceCount: number;
};

export type StepParameterSegment =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "token";
      token: string;
      name: string;
      label: string;
      resolvedValue: string | null;
    };

type StepParameterSource = Pick<TestStep, "id" | "action" | "expected_result" | "automation_code" | "api_request">;
type StepApiLike = NonNullable<TestStep["api_request"]>;

const STEP_PARAMETER_PATTERN = /(?<![A-Za-z0-9_])@(?:(t|s|r)\.)?([A-Za-z][A-Za-z0-9_-]*)/gi;
const STEP_PARAMETER_SCOPE_LABELS: Record<StepParameterScope, string> = {
  t: "Test case",
  s: "Suite",
  r: "Run"
};

export function normalizeStepParameterScope(value?: string | null, fallback: StepParameterScope = "t"): StepParameterScope {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "s" || normalized === "suite") {
    return "s";
  }

  if (normalized === "r" || normalized === "run") {
    return "r";
  }

  return fallback;
}

export function normalizeStepParameterName(value?: string | null, fallbackScope: StepParameterScope = "t") {
  const trimmed = String(value || "").trim().replace(/^@+/, "");

  if (!trimmed) {
    return "";
  }

  const scopedMatch = trimmed.match(/^([tsr])\.(.+)$/i);
  const scope = normalizeStepParameterScope(scopedMatch?.[1], fallbackScope);
  const rawName = String(scopedMatch?.[2] || trimmed).trim().toLowerCase();

  if (!rawName) {
    return "";
  }

  return `${scope}.${rawName}`;
}

export function getStepParameterScopeLabel(scope: StepParameterScope) {
  return STEP_PARAMETER_SCOPE_LABELS[scope];
}

export function parseStepParameterName(value?: string | null, fallbackScope: StepParameterScope = "t") {
  const normalized = normalizeStepParameterName(value, fallbackScope);

  if (!normalized) {
    return null;
  }

  const separatorIndex = normalized.indexOf(".");
  const scope = normalizeStepParameterScope(normalized.slice(0, separatorIndex), fallbackScope);
  const rawName = normalized.slice(separatorIndex + 1);

  return {
    key: normalized,
    name: normalized,
    rawName,
    scope,
    scopeLabel: getStepParameterScopeLabel(scope),
    token: `@${scope}.${rawName}`
  };
}

export function normalizeStepParameterValues(
  values: Record<string, string> = {},
  fallbackScope: StepParameterScope = "t"
) {
  return Object.entries(values).reduce<Record<string, string>>((next, [key, value]) => {
    const normalizedKey = normalizeStepParameterName(key, fallbackScope);

    if (!normalizedKey) {
      return next;
    }

    next[normalizedKey] = value;
    return next;
  }, {});
}

export function combineStepParameterValues(...valueMaps: Array<Record<string, string> | undefined | null>) {
  return valueMaps.reduce<Record<string, string>>((next, valueMap) => {
    Object.assign(next, valueMap || {});
    return next;
  }, {});
}

export function filterStepParameterValuesByScope(values: Record<string, string>, scope: StepParameterScope) {
  return Object.entries(values).reduce<Record<string, string>>((next, [key, value]) => {
    const parsed = parseStepParameterName(key, scope);

    if (!parsed || parsed.scope !== scope) {
      return next;
    }

    next[parsed.name] = value;
    return next;
  }, {});
}

export function extractStepParameterMatches(text?: string | null) {
  const source = String(text || "");

  if (!source) {
    return [];
  }

  return [...source.matchAll(STEP_PARAMETER_PATTERN)].map((match) => ({
    token: match[0],
    label: match[2],
    rawName: String(match[2] || "").trim(),
    scope: normalizeStepParameterScope(match[1], "t"),
    name: normalizeStepParameterName(`${match[1] || "t"}.${match[2]}`),
    index: match.index || 0
  }));
}

export function collectStepParameters(steps: StepParameterSource[]): StepParameterDefinition[] {
  const parameterMap = new Map<string, StepParameterDefinition>();

  const registerParsedParameter = (stepId: string, value?: string | null) => {
    const parsed = parseStepParameterName(value);

    if (!parsed) {
      return;
    }

    const current =
      parameterMap.get(parsed.name) || {
        name: parsed.name,
        rawName: parsed.rawName,
        label: parsed.rawName,
        token: parsed.token,
        scope: parsed.scope,
        scopeLabel: parsed.scopeLabel,
        stepIds: [],
        occurrenceCount: 0
      };

    current.occurrenceCount += 1;

    if (!current.stepIds.includes(stepId)) {
      current.stepIds.push(stepId);
    }

    parameterMap.set(parsed.name, current);
  };

  const registerValue = (stepId: string, value?: string | null) => {
    extractStepParameterMatches(value).forEach((match) => {
      const current =
        parameterMap.get(match.name) || {
          name: match.name,
          rawName: match.rawName.toLowerCase(),
          label: match.label,
          token: `@${match.scope}.${match.rawName}`,
          scope: match.scope,
          scopeLabel: getStepParameterScopeLabel(match.scope),
          stepIds: [],
          occurrenceCount: 0
        };

      current.occurrenceCount += 1;

      if (!current.stepIds.includes(stepId)) {
        current.stepIds.push(stepId);
      }

      parameterMap.set(match.name, current);
    });
  };

  const registerApiRequest = (stepId: string, apiRequest?: StepApiLike | null) => {
    if (!apiRequest) {
      return;
    }

    registerValue(stepId, apiRequest.url);
    registerValue(stepId, apiRequest.body);

    (apiRequest.headers || []).forEach((header) => {
      registerValue(stepId, header.key);
      registerValue(stepId, header.value);
    });

    (apiRequest.validations || []).forEach((validation) => {
      registerValue(stepId, validation.target);
      registerValue(stepId, validation.expected);
    });

    (apiRequest.captures || []).forEach((capture) => {
      registerParsedParameter(stepId, capture.parameter);
    });
  };

  steps.forEach((step) => {
    [step.action, step.expected_result, step.automation_code].forEach((value) => registerValue(step.id, value));
    registerApiRequest(step.id, step.api_request);
  });

  return [...parameterMap.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function filterStepParameterValues(
  values: Record<string, string>,
  parameters: Array<Pick<StepParameterDefinition, "name">>
) {
  const allowed = new Set(parameters.map((parameter) => parameter.name));
  const normalizedValues = normalizeStepParameterValues(values);

  return Object.entries(normalizedValues).reduce<Record<string, string>>((next, [key, value]) => {
    if (!allowed.has(key)) {
      return next;
    }

    next[key] = value;
    return next;
  }, {});
}

export function buildDataSetParameterValues(dataSet?: ExecutionDataSetSnapshot | null) {
  const values: Record<string, string> = {};

  if (!dataSet?.rows?.length) {
    return values;
  }

  if (dataSet.mode === "key_value") {
    dataSet.rows.forEach((row) => {
      const key = normalizeStepParameterName(String(row.key ?? ""), "t");

      if (!key) {
        return;
      }

      values[key] = String(row.value ?? "");
    });

    return values;
  }

  const firstRow = dataSet.rows.find((row) => row && typeof row === "object") || null;

  if (!firstRow) {
    return values;
  }

  Object.entries(firstRow).forEach(([column, value]) => {
    const key = normalizeStepParameterName(column, "t");

    if (!key) {
      return;
    }

    values[key] = String(value ?? "");
  });

  return values;
}

export function mapStepParameterSegments(text?: string | null, values: Record<string, string> = {}): StepParameterSegment[] {
  const source = String(text || "");
  const normalizedValues = normalizeStepParameterValues(values);

  if (!source) {
    return [];
  }

  const segments: StepParameterSegment[] = [];
  let cursor = 0;

  extractStepParameterMatches(source).forEach((match) => {
    if (match.index > cursor) {
      segments.push({
        type: "text",
        value: source.slice(cursor, match.index)
      });
    }

    const resolvedValue = normalizedValues[match.name];

    segments.push({
      type: "token",
      token: match.token,
      name: match.name,
      label: match.label,
      resolvedValue: resolvedValue === undefined ? null : resolvedValue
    });

    cursor = match.index + match.token.length;
  });

  if (cursor < source.length) {
    segments.push({
      type: "text",
      value: source.slice(cursor)
    });
  }

  return segments;
}

export function resolveStepParameterText(text?: string | null, values: Record<string, string> = {}) {
  if (!text) {
    return "";
  }

  return mapStepParameterSegments(text, values)
    .map((segment) => (segment.type === "text" ? segment.value : segment.resolvedValue ?? segment.token))
    .join("");
}
