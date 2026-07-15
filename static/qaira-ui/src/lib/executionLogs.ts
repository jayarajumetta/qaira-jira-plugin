export type ExecutionStepStatus = "passed" | "failed" | "blocked";

export type ExecutionStepEvidence = {
  attachmentId?: string;
  dataUrl?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  checksum?: string;
  createdAt?: string;
};

export type ExecutionApiAssertion = {
  kind: string;
  passed: boolean;
  target?: string | null;
  expected?: string | null;
  actual?: string | null;
};

export type ExecutionStepApiDetail = {
  step_id?: string;
  request?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string | null;
  };
  response?: {
    status?: number;
    status_text?: string;
    headers?: Record<string, string>;
    body?: string;
    json?: unknown;
  };
  captures?: Record<string, string>;
  assertions?: ExecutionApiAssertion[];
};

export type ExecutionStepWebDetail = {
  provider?: string;
  started_at?: string;
  ended_at?: string;
  duration_ms?: number;
  url?: string;
  console?: Array<{
    type?: string;
    text?: string;
    timestamp?: string;
    location?: string | null;
  }>;
  network?: Array<{
    method?: string;
    url?: string;
    status?: number | null;
    resource_type?: string | null;
    error?: string | null;
    timestamp?: string;
  }>;
  captures?: Record<string, string>;
};

export type ExecutionStepAutomationDetail = {
  engine?: string;
  provider?: string | null;
  status?: ExecutionStepStatus | "queued" | "running" | "skipped";
  code?: string;
  language?: string;
  active_line?: number | null;
  error_line?: number | null;
  error_message?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};

export type ExecutionStepCaptureMap = Record<string, string>;

export type ExecutionAiAnalysis = {
  executionId?: string;
  testCaseId?: string;
  generatedForStatus?: string;
  response: string;
  generatedAt?: string;
  integration?: {
    id?: string;
    name?: string;
    model?: string | null;
  };
};

export type ExecutionLogsPayload = {
  stepStatuses?: Record<string, ExecutionStepStatus>;
  stepNotes?: Record<string, string>;
  stepEvidence?: Record<string, ExecutionStepEvidence>;
  stepDefects?: Record<string, string[]>;
  stepApiDetails?: Record<string, ExecutionStepApiDetail>;
  stepWebDetails?: Record<string, ExecutionStepWebDetail>;
  stepAutomationDetails?: Record<string, ExecutionStepAutomationDetail>;
  stepCaptures?: Record<string, ExecutionStepCaptureMap>;
  aiAnalysis?: ExecutionAiAnalysis | null;
};

const isExecutionEvidenceDataUrl = (value: string) =>
  /^data:(image|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(value.trim());

const normalizeStepEvidence = (value: unknown): Record<string, ExecutionStepEvidence> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, ExecutionStepEvidence>>((accumulator, [stepId, evidence]) => {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      return accumulator;
    }

    const dataUrl = typeof (evidence as { dataUrl?: unknown }).dataUrl === "string"
      ? String((evidence as { dataUrl?: string }).dataUrl || "").trim()
      : "";

    const attachmentId = typeof (evidence as { attachmentId?: unknown }).attachmentId === "string"
      ? String((evidence as { attachmentId?: string }).attachmentId || "").trim()
      : "";

    if (!attachmentId && (!dataUrl || !isExecutionEvidenceDataUrl(dataUrl))) {
      return accumulator;
    }

    accumulator[stepId] = {
      attachmentId: attachmentId || undefined,
      dataUrl: dataUrl && isExecutionEvidenceDataUrl(dataUrl) ? dataUrl : undefined,
      fileName: typeof (evidence as { fileName?: unknown }).fileName === "string"
        ? String((evidence as { fileName?: string }).fileName || "").trim() || undefined
        : undefined,
      mimeType: typeof (evidence as { mimeType?: unknown }).mimeType === "string"
        ? String((evidence as { mimeType?: string }).mimeType || "").trim() || undefined
        : undefined,
      size: typeof (evidence as { size?: unknown }).size === "number"
        ? Number((evidence as { size?: number }).size || 0)
        : undefined,
      checksum: typeof (evidence as { checksum?: unknown }).checksum === "string"
        ? String((evidence as { checksum?: string }).checksum || "").trim() || undefined
        : undefined,
      createdAt: typeof (evidence as { createdAt?: unknown }).createdAt === "string"
        ? String((evidence as { createdAt?: string }).createdAt || "").trim() || undefined
        : undefined
    };

    return accumulator;
  }, {});
};

const normalizeStepCaptures = (value: unknown): Record<string, ExecutionStepCaptureMap> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, ExecutionStepCaptureMap>>((accumulator, [stepId, captures]) => {
    if (!captures || typeof captures !== "object" || Array.isArray(captures)) {
      return accumulator;
    }

    const normalizedCaptures = Object.entries(captures as Record<string, unknown>).reduce<ExecutionStepCaptureMap>((entryMap, [key, captureValue]) => {
      const normalizedKey = String(key || "").trim().replace(/^@+/, "").toLowerCase();

      if (!normalizedKey) {
        return entryMap;
      }

      entryMap[normalizedKey] = captureValue === undefined || captureValue === null ? "" : String(captureValue);
      return entryMap;
    }, {});

    if (!Object.keys(normalizedCaptures).length) {
      return accumulator;
    }

    accumulator[stepId] = normalizedCaptures;
    return accumulator;
  }, {});
};

const normalizeAiAnalysis = (value: unknown): ExecutionAiAnalysis | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const response = typeof (value as { response?: unknown }).response === "string"
    ? String((value as { response?: string }).response || "").trim()
    : "";

  if (!response) {
    return null;
  }

  const integrationValue = (value as { integration?: unknown }).integration;
  const integration =
    integrationValue && typeof integrationValue === "object" && !Array.isArray(integrationValue)
      ? {
          id: typeof (integrationValue as { id?: unknown }).id === "string"
            ? String((integrationValue as { id?: string }).id || "").trim() || undefined
            : undefined,
          name: typeof (integrationValue as { name?: unknown }).name === "string"
            ? String((integrationValue as { name?: string }).name || "").trim() || undefined
            : undefined,
          model: typeof (integrationValue as { model?: unknown }).model === "string"
            ? String((integrationValue as { model?: string }).model || "").trim() || null
            : null
        }
      : undefined;

	  return {
	    executionId: typeof (value as { executionId?: unknown }).executionId === "string"
	      ? String((value as { executionId?: string }).executionId || "").trim() || undefined
	      : undefined,
	    testCaseId: typeof (value as { testCaseId?: unknown }).testCaseId === "string"
	      ? String((value as { testCaseId?: string }).testCaseId || "").trim() || undefined
	      : undefined,
	    generatedForStatus: typeof (value as { generatedForStatus?: unknown }).generatedForStatus === "string"
	      ? String((value as { generatedForStatus?: string }).generatedForStatus || "").trim() || undefined
	      : undefined,
	    response,
    generatedAt: typeof (value as { generatedAt?: unknown }).generatedAt === "string"
      ? String((value as { generatedAt?: string }).generatedAt || "").trim() || undefined
      : undefined,
    integration
  };
};

export function parseExecutionLogs(logs: string | null): ExecutionLogsPayload {
  if (!logs?.trim()) {
    return {};
  }

  try {
    const payload = JSON.parse(logs) as ExecutionLogsPayload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {};
    }
    return {
      stepStatuses: typeof payload.stepStatuses === "object" && payload.stepStatuses && !Array.isArray(payload.stepStatuses)
        ? payload.stepStatuses
        : {},
      stepNotes: typeof payload.stepNotes === "object" && payload.stepNotes && !Array.isArray(payload.stepNotes) ? payload.stepNotes : {},
      stepEvidence: normalizeStepEvidence(payload.stepEvidence),
      stepDefects: typeof payload.stepDefects === "object" && payload.stepDefects && !Array.isArray(payload.stepDefects)
        ? Object.fromEntries(Object.entries(payload.stepDefects).map(([stepId, ids]) => [stepId, Array.isArray(ids) ? [...new Set(ids.map(String).filter(Boolean))] : []]).filter(([, ids]) => ids.length))
        : {},
      stepApiDetails: typeof payload.stepApiDetails === "object" && payload.stepApiDetails && !Array.isArray(payload.stepApiDetails)
        ? payload.stepApiDetails
        : {},
      stepWebDetails: typeof payload.stepWebDetails === "object" && payload.stepWebDetails && !Array.isArray(payload.stepWebDetails)
        ? payload.stepWebDetails
        : {},
      stepAutomationDetails: typeof payload.stepAutomationDetails === "object" && payload.stepAutomationDetails && !Array.isArray(payload.stepAutomationDetails)
        ? payload.stepAutomationDetails
        : {},
      stepCaptures: normalizeStepCaptures(payload.stepCaptures),
      aiAnalysis: normalizeAiAnalysis(payload.aiAnalysis)
    };
  } catch {
    return {};
  }
}

export function stringifyExecutionLogs(payload: ExecutionLogsPayload): string {
  return JSON.stringify({
    stepStatuses: payload.stepStatuses || {},
    stepNotes: payload.stepNotes || {},
    stepEvidence: payload.stepEvidence || {},
    stepDefects: payload.stepDefects || {},
    stepApiDetails: payload.stepApiDetails || {},
    stepWebDetails: payload.stepWebDetails || {},
    stepAutomationDetails: payload.stepAutomationDetails || {},
    stepCaptures: payload.stepCaptures || {},
    aiAnalysis: payload.aiAnalysis || null
  });
}

export function deriveCaseStatusFromSteps(
  stepIds: string[],
  stepStatuses: Record<string, ExecutionStepStatus>
): "running" | "passed" | "failed" | "blocked" {
  if (!stepIds.length) {
    return "passed";
  }

  if (Object.values(stepStatuses).some((status) => status === "failed")) {
    return "failed";
  }

  const allResolved = stepIds.every((id) => Boolean(stepStatuses[id]));
  if (!allResolved) {
    return Object.keys(stepStatuses).length ? "running" : "blocked";
  }

  if (stepIds.some((id) => stepStatuses[id] === "blocked")) {
    return "blocked";
  }

  return "passed";
}
