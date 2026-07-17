import { invoke, requestJira } from "@forge/bridge";
import type {
  AdminHealthSnapshot,
  ApiRequestPreview,
  AgenticWorkflow,
  AgenticWorkflowRun,
  ApiKeyScope,
  ApiKeyScopeOption,
  AppNotification,
  AiCaseAuthoringPreviewResponse,
  AiDesignImageInput,
  AiDesignPreviewResponse,
  AiPromptTemplate,
  AiRequirementDescriptionRephraseResponse,
  AiRichTextRephraseResponse,
  AiStepRephraseResponse,
  AiTestDataGenerationPreviewResponse,
  AiTestCaseGenerationJob,
  AutomationBuildResponse,
  AutomationLearningCacheEntry,
  ObjectRepositoryImportEntry,
  ObjectRepositoryImportResult,
  ObjectRepositoryContext,
  AuthSetupPayload,
  ApiError,
  AppType,
  DomainMetadata,
  Execution,
  ExecutionResult,
  ExecutionSchedule,
  FeatureFlagSnapshot,
  Issue,
  Integration,
  JiraAttachment,
  KeyValueEntry,
  Permission,
  PermissionGroup,
  Project,
  ProjectMember,
  QualityGateAssessmentPreviewResponse,
  QualityDashboard,
  QualityDashboardBatchResponse,
  QualityDashboardDesignPreviewResponse,
  QualityDashboardGadget,
  QualityDashboardGadgetResult,
  QualityInsightPreviewResponse,
  Requirement,
  RequirementImpactPreviewResponse,
  RequirementIteration,
  Role,
  SessionPayload,
  RecorderSessionResponse,
  SharedStepGroup,
  SmartExecutionPreviewResponse,
  TestConfiguration,
  TestCase,
  TestCaseImpactPreviewResponse,
  TestCaseDefectLink,
  TestCaseModule,
  TestCaseVersionSnapshot,
  TestCaseVersionSummary,
  TestDataSet,
  TestDataSetMode,
  TestEnvironment,
  TestStep,
  TestSuite,
  UserApiKey,
  User,
  ExecutionFailureClusterPreviewResponse,
  WorkspaceTransaction,
  WorkspaceTransactionArtifact,
  WorkspaceTransactionEvent
} from "../types";
import type { ExecutionStartResponse } from "./executionStartSummary";
import type { ExecutionAiAnalysis } from "./executionLogs";
import { appendCurrentProjectScope } from "./currentScope";

type AiRequirementCreationSuggestion = {
  client_id: string;
  title: string;
  description: string;
  external_references: string[];
  priority: number;
  status: string;
  acceptance_criteria: string[];
  risks: string[];
  open_questions: string[];
  change_summary: string[];
  quality_score: number;
  rationale: string;
};

type AiRequirementCreationPreviewResponse = {
  requirement: null;
  integration: { id: string; name: string; type: string; model?: string | null } | null;
  suggestion: AiRequirementCreationSuggestion & { client_id?: string };
  requirements: AiRequirementCreationSuggestion[];
  generated: number;
  fallback_used: boolean;
  fallback_reason?: string | null;
  status?: string;
};

type AiRequirementGenerationJobResponse = Partial<AiRequirementCreationPreviewResponse> & {
  id: string;
  job_id?: string;
  queued?: boolean;
  project_id: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  input_payload?: Record<string, unknown>;
  last_error?: string | null;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string;
};

const SESSION_KEY = "qaira.session";
const CLIENT_GET_CACHE_TTL_MS = 1_500;
const CLIENT_GET_CACHE_MAX_ENTRIES = 120;

const inFlightClientRequests = new Map<string, Promise<unknown>>();
const clientGetResponseCache = new Map<string, { expiresAt: number; value: unknown }>();
export const qairaAuthSessionEvents = {
  refresh: "qaira-auth-session-refresh"
} as const;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
};

const rememberClientGetResponse = (key: string, value: unknown) => {
  clientGetResponseCache.set(key, {
    expiresAt: Date.now() + CLIENT_GET_CACHE_TTL_MS,
    value
  });

  while (clientGetResponseCache.size > CLIENT_GET_CACHE_MAX_ENTRIES) {
    const oldestKey = clientGetResponseCache.keys().next().value;
    if (!oldestKey) break;
    clientGetResponseCache.delete(oldestKey);
  }
};

const readClientGetResponse = (key: string) => {
  const cached = clientGetResponseCache.get(key);

  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    clientGetResponseCache.delete(key);
    return undefined;
  }

  return cached.value;
};

async function ensureJiraResponse(response: Response, action: string) {
  if (response.ok) {
    return response;
  }

  let detail = "";
  try {
    const raw = await response.text();
    try {
      const payload = JSON.parse(raw) as { errorMessages?: string[]; errors?: Record<string, string>; message?: string };
      detail = payload.message
        || payload.errorMessages?.filter(Boolean).join(" ")
        || Object.values(payload.errors || {}).filter(Boolean).join(" ");
    } catch {
      detail = raw;
    }
  } catch {
    detail = "";
  }

  throw new Error(detail || `${action} failed with Jira status ${response.status}.`);
}

function normalizeJiraAttachment(value: unknown): JiraAttachment {
  const attachment = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const authorValue = attachment.author && typeof attachment.author === "object"
    ? attachment.author as Record<string, unknown>
    : null;

  return {
    id: String(attachment.id || ""),
    filename: String(attachment.filename || "attachment"),
    size: Number(attachment.size || 0),
    mimeType: String(attachment.mimeType || attachment.mime_type || "application/octet-stream"),
    created: typeof attachment.created === "string" ? attachment.created : null,
    content: typeof attachment.content === "string" ? attachment.content : null,
    thumbnail: typeof attachment.thumbnail === "string" ? attachment.thumbnail : null,
    author: authorValue ? {
      accountId: typeof authorValue.accountId === "string" ? authorValue.accountId : undefined,
      displayName: typeof authorValue.displayName === "string" ? authorValue.displayName : undefined,
      avatarUrls: authorValue.avatarUrls && typeof authorValue.avatarUrls === "object"
        ? authorValue.avatarUrls as Record<string, string>
        : undefined
    } : null
  };
}

type IssuePayload = {
  user_id: string;
  title: string;
  message: string;
  steps_to_reproduce?: string;
  expected_result?: string;
  actual_result?: string;
  severity?: string;
  priority?: string;
  environment?: string;
  build?: string;
  jira_bug_key?: string;
  linked_test_run_id?: string;
  linked_test_case_ids?: string[];
  linked_requirement_ids?: string[];
  assignee_id?: string;
  root_cause?: string;
  status?: string;
  labels?: string[];
  sprint?: string;
  fix_version?: string;
  release?: string;
  additional_fields?: Record<string, unknown>;
  expected_revision?: number;
};

export type JiraCreateFieldMetadata = {
  id: string;
  key?: string;
  name: string;
  required: boolean;
  has_default_value: boolean;
  schema?: {
    type?: string;
    items?: string;
    custom?: string;
    customId?: number;
  };
  operations?: string[];
  allowed_values?: Array<{
    id?: string;
    key?: string;
    name?: string;
    value?: string;
    accountId?: string;
    displayName?: string;
    label?: string;
  }>;
};

export type JiraIssueCreateMetadata = {
  project_id: string;
  project_key: string;
  issue_type_id: string;
  issue_type_name: string;
  qaira_core_field_ids: string[];
  required_fields: JiraCreateFieldMetadata[];
  core_fields: JiraCreateFieldMetadata[];
  fields: JiraCreateFieldMetadata[];
  strategy?: {
    requirements_source: string;
    bugs_source: string;
    synced_fields: string[];
    note: string;
  };
};

export type JiraBugCreateMetadata = JiraIssueCreateMetadata;

type ForgeBlobPayload = {
  __qaira_blob__: true;
  base64: string;
  mimeType?: string;
  fileName?: string;
};

export const sessionStorage = {
  read(): SessionPayload | null {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionPayload;
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
  },
  write(session: SessionPayload) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },
  clear() {
    window.localStorage.removeItem(SESSION_KEY);
  }
};

let qairaSessionRefreshPromise: Promise<SessionPayload> | null = null;

function cleanForgeInvocationError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return message.replace(/^There was an error invoking the function\s*-?\s*/i, "");
}

function requestPathname(rawPath: string) {
  try {
    return new URL(rawPath, "https://qaira.local").pathname;
  } catch {
    return rawPath.split("?")[0] || "/";
  }
}

function isRecoverableAuthenticationError(message: string) {
  if (/QAIRA_PERMISSION_DENIED|JIRA_PERMISSION_DENIED|permission is required|permission denied/i.test(message)) {
    return false;
  }

  return /Authentication Required|Unauthenticated|Unauthorized|AUTHENTICATION_REQUIRED|\b401\b/i.test(message);
}

async function refreshQairaSession() {
  if (!qairaSessionRefreshPromise) {
    qairaSessionRefreshPromise = (async () => {
      const session = (await invoke("qairaApi", {
        path: appendCurrentProjectScope("/auth/session"),
        method: "GET",
        body: {},
        headers: {}
      })) as SessionPayload;
      sessionStorage.write(session);
      clientGetResponseCache.clear();
      window.dispatchEvent(new CustomEvent(qairaAuthSessionEvents.refresh, { detail: session }));
      return session;
    })().finally(() => {
      qairaSessionRefreshPromise = null;
    });
  }

  return qairaSessionRefreshPromise;
}

function normalizeBody(body: BodyInit | null | undefined): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  return body;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = String(init?.method || "GET").toUpperCase();
  const body = normalizeBody(init?.body);
  const headers = init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {};
  const scopedPath = appendCurrentProjectScope(path);
  const authRoute = requestPathname(scopedPath).startsWith("/auth/");
  const canReuseRequest = method === "GET";
  const requestKey = canReuseRequest
    ? stableStringify({ body, headers, method, path: scopedPath })
    : "";

  if (canReuseRequest) {
    const cached = readClientGetResponse(requestKey);

    if (cached !== undefined) {
      return cached as T;
    }

    const pending = inFlightClientRequests.get(requestKey);

    if (pending) {
      return (await pending) as T;
    }
  }

  const executeRequest = async (allowAuthRetry = true): Promise<T> => {
    try {
      return (await invoke("qairaApi", {
        path: scopedPath,
        method,
        body,
        headers
      })) as T;
    } catch (err) {
      const message = cleanForgeInvocationError(err, "Qaira request failed");
      if (allowAuthRetry && !authRoute && isRecoverableAuthenticationError(message)) {
        await refreshQairaSession();
        return executeRequest(false);
      }
      throw new Error(message);
    }
  };

  const pendingRequest = executeRequest();

  if (canReuseRequest) {
    inFlightClientRequests.set(requestKey, pendingRequest);
  }

  try {
    const response = await pendingRequest;

    if (canReuseRequest) {
      rememberClientGetResponse(requestKey, response);
    } else {
      clientGetResponseCache.clear();
    }

    return response;
  } catch (err) {
    throw new Error(cleanForgeInvocationError(err, "Qaira request failed"));
  } finally {
    if (canReuseRequest) {
      inFlightClientRequests.delete(requestKey);
    }
  }
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const scopedPath = appendCurrentProjectScope(path);
  const method = String(init?.method || "GET").toUpperCase();
  const body = normalizeBody(init?.body);
  const headers = init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {};
  const authRoute = requestPathname(scopedPath).startsWith("/auth/");
  const executeRequest = async (allowAuthRetry = true): Promise<ForgeBlobPayload> => {
    try {
      return (await invoke("qairaApi", {
        path: scopedPath,
        method,
        body,
        headers,
        responseType: "blob"
      })) as ForgeBlobPayload;
    } catch (err) {
      const message = cleanForgeInvocationError(err, "Qaira download failed");
      if (allowAuthRetry && !authRoute && isRecoverableAuthenticationError(message)) {
        await refreshQairaSession();
        return executeRequest(false);
      }
      throw new Error(message);
    }
  };

  try {
    const payload = await executeRequest();

    if (!payload?.__qaira_blob__) {
      throw new Error(`Qaira did not return a downloadable artifact for ${path}`);
    }

    const binary = window.atob(payload.base64 || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: payload.mimeType || "application/octet-stream" });
  } catch (err) {
    throw new Error(cleanForgeInvocationError(err, "Qaira download failed"));
  }
}

type TestCaseImportSourceValue = "csv" | "junit_xml" | "testng_xml" | "postman_collection";

type BatchQueueResponse = {
  id: string;
  transaction_id: string;
  job_id?: string;
  transaction_ids?: string[];
  job_ids?: string[];
  split_count?: number;
  queued: boolean;
  status: string;
  count?: number;
  skipped?: Array<{ id?: string; code?: string; message?: string }>;
  records?: Array<TestCase & { steps?: TestStep[] }>;
};

type DashboardStyledReportPayload = {
  rendered_snapshot_data_url?: string;
  rendered_snapshot_name?: string;
  rendered_snapshot_captured_at?: string;
};

type TestCaseImportBatchInput = {
  file_name?: string;
  import_source: TestCaseImportSourceValue;
  rows: Array<Record<string, unknown>>;
};

type AgenticApiAgentTestInput = {
  method?: string;
  url: string;
  auth?: string;
  responseStyle?: string;
  body?: string;
  credential?: Record<string, unknown> | null;
};

const MAX_IMPORT_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_IMPORT_ROWS_PER_BATCH = 250;

const splitRowsForImport = (rows: Array<Record<string, unknown>>) => {
  const chunks: Array<Array<Record<string, unknown>>> = [];
  let current: Array<Record<string, unknown>> = [];
  let currentBytes = 0;

  rows.forEach((row) => {
    const rowBytes = JSON.stringify(row).length + 2;
    const shouldStartNext =
      current.length > 0
      && (current.length >= MAX_IMPORT_ROWS_PER_BATCH || currentBytes + rowBytes > MAX_IMPORT_REQUEST_BYTES);

    if (shouldStartNext) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }

    current.push(row);
    currentBytes += rowBytes;
  });

  if (current.length) {
    chunks.push(current);
  }

  return chunks;
};

const splitTestCaseImportInput = (input: {
  app_type_id: string;
  requirement_id?: string;
  import_source?: TestCaseImportSourceValue;
  rows?: Array<Record<string, unknown>>;
  batches?: TestCaseImportBatchInput[];
}) => {
  const payloads: Array<typeof input> = [];

  if (input.batches?.length) {
    input.batches.forEach((batch) => {
      splitRowsForImport(batch.rows || []).forEach((rows, index) => {
        payloads.push({
          app_type_id: input.app_type_id,
          requirement_id: input.requirement_id,
          import_source: input.import_source,
          batches: [{
            file_name: index ? `${batch.file_name || "import"} part ${index + 1}` : batch.file_name,
            import_source: batch.import_source,
            rows
          }]
        });
      });
    });
  } else if (input.rows?.length) {
    splitRowsForImport(input.rows).forEach((rows) => {
      payloads.push({
        app_type_id: input.app_type_id,
        requirement_id: input.requirement_id,
        import_source: input.import_source,
        rows
      });
    });
  }

  return payloads.length ? payloads : [input];
};

export const api = {
  admin: {
    health: (query?: { project_id?: string }) => request<AdminHealthSnapshot>(`/admin/health${toQueryString(query)}`)
  },
  ai: {
    qualityInsights: (query: { project_id: string; release?: string }) =>
      request<QualityInsightPreviewResponse>(`/ai/quality-insights${toQueryString(query)}`),
    rephraseRichText: (input: {
      project_id: string;
      content: string;
      content_html?: string;
      entity_type?: string;
      entity_title?: string;
      field_label?: string;
      aria_label?: string;
    }) => request<AiRichTextRephraseResponse>("/ai/rich-text-rephrase", {
      method: "POST",
      body: JSON.stringify(input)
    })
  },
  analytics: {
    query: (input: { project_id: string; jql: string; gadget: QualityDashboardGadget; limit?: number }) =>
      request<QualityDashboardGadgetResult>("/analytics/jql", { method: "POST", body: JSON.stringify(input) }),
    queryBatch: (input: { project_id: string; gadgets: QualityDashboardGadget[]; limit?: number }) =>
      request<QualityDashboardBatchResponse>("/analytics/jql-batch", { method: "POST", body: JSON.stringify(input) }),
    designDashboard: (input: { project_id: string; stakeholder: "executive" | "product" | "quality" | "automation"; release?: string; goal?: string; name?: string }) =>
      request<QualityDashboardDesignPreviewResponse>("/analytics/dashboard-design-preview", { method: "POST", body: JSON.stringify(input) })
  },
  qualityDashboards: {
    list: (query?: { project_id?: string }) => request<QualityDashboard[]>(`/quality-dashboards${toQueryString(query)}`),
    create: (input: Omit<QualityDashboard, "id" | "project_id"> & { project_id: string }) =>
      request<QualityDashboard>("/quality-dashboards", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<QualityDashboard>) =>
      request<QualityDashboard>(`/quality-dashboards/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    downloadReportPdf: (id: string, input?: DashboardStyledReportPayload) =>
      input?.rendered_snapshot_data_url
        ? requestBlob(`/quality-dashboards/${id}/report.pdf`, { method: "POST", body: JSON.stringify(input) })
        : requestBlob(`/quality-dashboards/${id}/report.pdf`),
    shareReport: (id: string, input: { recipients: string[] } & DashboardStyledReportPayload) =>
      request<{ sent: boolean; recipients: number }>(`/quality-dashboards/${id}/share-report`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    delete: (id: string) => request<{ deleted: boolean }>(`/quality-dashboards/${id}`, { method: "DELETE" })
  },
  attachments: {
    meta: async () => {
      const response = await requestJira(
        "/rest/api/3/attachment/meta",
        { headers: { Accept: "application/json" } }
      );
      await ensureJiraResponse(response, "Loading Jira attachment settings");
      const payload = await response.json() as { enabled?: boolean; uploadLimit?: number };
      return {
        enabled: payload.enabled !== false,
        uploadLimit: Number(payload.uploadLimit || 0)
      };
    },
    list: async (issueKey: string) => {
      const response = await requestJira(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=attachment`,
        { headers: { Accept: "application/json" } }
      );
      await ensureJiraResponse(response, "Loading attachments");
      const payload = await response.json() as { fields?: { attachment?: unknown[] } };
      return (payload.fields?.attachment || []).map(normalizeJiraAttachment).filter((attachment) => attachment.id);
    },
    upload: async (issueKey: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file, file.name);
      const response = await requestJira(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "X-Atlassian-Token": "no-check"
          },
          body: formData
        }
      );
      await ensureJiraResponse(response, "Uploading attachment");
      const payload = await response.json() as unknown;
      const first = Array.isArray(payload) ? payload[0] : payload;
      const attachment = normalizeJiraAttachment(first);
      if (!attachment.id) {
        throw new Error("Jira accepted the upload but did not return an attachment ID.");
      }
      return attachment;
    },
    download: async (attachmentId: string) => {
      const response = await requestJira(
        `/rest/api/3/attachment/content/${encodeURIComponent(attachmentId)}?redirect=false`,
        { headers: { Accept: "*/*" } }
      );
      await ensureJiraResponse(response, "Downloading attachment");
      return response.blob();
    },
    delete: async (attachmentId: string) => {
      const response = await requestJira(
        `/rest/api/3/attachment/${encodeURIComponent(attachmentId)}`,
        { method: "DELETE", headers: { Accept: "application/json" } }
      );
      await ensureJiraResponse(response, "Deleting attachment");
      return { deleted: true, id: attachmentId };
    }
  },
  settings: {
    getLocalization: () => request<{ strings: Record<string, string> }>("/settings/localization"),
    updateLocalization: (input: { strings: Record<string, string> }) =>
      request<{ updated: boolean; strings: Record<string, string> }>("/settings/localization", {
        method: "PUT",
        body: JSON.stringify(input)
      }),
    getWorkspacePreferences: () => request<{ preferences: Record<string, unknown> }>("/settings/workspace-preferences"),
    updateWorkspacePreferences: (input: { preferences: Record<string, unknown> }) =>
      request<{ updated: boolean; preferences: Record<string, unknown> }>("/settings/workspace-preferences", {
        method: "PUT",
        body: JSON.stringify(input)
      }),
    listApiKeys: () => request<{ api_keys: UserApiKey[]; scopes: ApiKeyScopeOption[] }>("/settings/api-keys"),
    createApiKey: (input: { name: string; scope?: ApiKeyScope }) =>
      request<{
        key: string;
        api_key: UserApiKey;
        authorization_header: string;
        x_api_key_header: string;
      }>("/settings/api-keys", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    revokeApiKey: (id: string) =>
      request<{ revoked: boolean; api_key: UserApiKey }>(`/settings/api-keys/${id}`, {
        method: "DELETE"
      }),
    deleteApiKey: (id: string) =>
      request<{ deleted: boolean; id: string }>(`/settings/api-keys/${id}/permanent`, {
        method: "DELETE"
      })
  },
  featureFlags: {
    snapshot: () => request<FeatureFlagSnapshot>("/feature-flags")
  },
  metadata: {
    domain: () => request<DomainMetadata>("/metadata/domain")
  },
  auth: {
    setup: () => request<AuthSetupPayload>("/auth/setup"),
    requestSignupCode: (input: { email: string; password: string; name?: string }) =>
      request<{ success: boolean; expiresAt?: string }>("/auth/signup/request-code", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    verifySignupCode: (input: { email: string; code: string }) =>
      request<{ success: boolean }>("/auth/signup/verify", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    login: (input: { email: string; password: string }) =>
      request<SessionPayload>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    loginWithGoogle: (input: { idToken: string }) =>
      request<SessionPayload>("/auth/login/google", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    requestPasswordResetCode: (input: { email: string; newPassword: string }) =>
      request<{ success: boolean; expiresAt?: string }>("/auth/forgot-password/request-code", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    verifyPasswordResetCode: (input: { email: string; code: string }) =>
      request<{ success: boolean }>("/auth/forgot-password/verify", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    session: () => request<SessionPayload>("/auth/session")
  },
  users: {
    list: () => request<User[]>("/users")
  },
  notifications: {
    list: (query?: { status?: "unread" | "read" | string }) =>
      request<AppNotification[]>(`/notifications${toQueryString(query)}`),
    realtimeToken: () =>
      request<{ token: string; expires_at: number }>("/notifications/realtime-token"),
    markRead: (id: string) =>
      request<{ updated: boolean }>(`/notifications/${id}/read`, { method: "PUT" }),
    markAllRead: () =>
      request<{ updated: boolean }>("/notifications/read-all", { method: "PUT" })
  },
  roles: {
    list: () => request<Role[]>("/roles"),
    permissions: () => request<PermissionGroup[]>("/permissions"),
    rolePermissions: (id: string) => request<Permission[]>(`/roles/${id}/permissions`),
    create: (input: { name: string; permission_codes?: string[] }) =>
      request<{ id: string }>("/roles", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ name: string; permission_codes: string[] }>) =>
      request<{ updated: boolean }>(`/roles/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    replacePermissions: (id: string, permission_codes: string[]) =>
      request<{ updated: boolean; permission_codes: string[] }>(`/roles/${id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permission_codes })
      }),
    delete: (id: string) => request<{ deleted: boolean }>(`/roles/${id}`, { method: "DELETE" })
  },
  projects: {
    list: () => request<Project[]>("/projects"),
    create: (input: { name: string; description?: string; created_by?: string; members?: Array<{ user_id: string; role_id: string }>; app_types?: Array<{ name: string; type: AppType["type"]; is_unified?: boolean }> }) =>
      request<{ id: string; key?: string; members_added: number; app_types_created: number; provisioning_errors?: Array<{ area: string; reference?: string; code?: string; message: string }> }>("/projects", { method: "POST", body: JSON.stringify(input) }),
    sync: (id: string, provider: "google_drive" | "github") =>
      request<{ id: string; duplicate?: boolean }>(`/projects/${id}/sync/${provider}`, { method: "POST" }),
    update: (id: string, input: Partial<{ name: string; description: string }>) =>
      request<{ updated: boolean }>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/projects/${id}`, { method: "DELETE" })
  },
  projectMembers: {
    list: (query?: { project_id?: string; user_id?: string; role_id?: string }) =>
      request<ProjectMember[]>(`/project-members${toQueryString(query)}`),
    create: (input: { project_id: string; user_id: string; role_id: string }) =>
      request<{ id: string }>("/project-members", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ project_id: string; user_id: string; role_id: string }>) =>
      request<{ updated: boolean }>(`/project-members/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/project-members/${id}`, { method: "DELETE" })
  },
  appTypes: {
    list: (query?: { project_id?: string }) => request<AppType[]>(`/app-types${toQueryString(query)}`),
    create: (input: { project_id: string; name: string; type: AppType["type"]; is_unified?: boolean }) =>
      request<{ id: string }>("/app-types", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ name: string; is_unified: boolean }>) =>
      request<{ updated: boolean }>(`/app-types/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/app-types/${id}`, { method: "DELETE" })
  },
  requirements: {
    list: (query?: { project_id?: string; status?: string; priority?: number; page_size?: number; limit?: number; cursor?: string; projection?: "summary" | "detail" }) =>
      request<Requirement[]>(`/requirements${toQueryString(query)}`),
    createMetadata: (query?: { project_id?: string }) =>
      request<JiraIssueCreateMetadata>(`/requirements/create-metadata${toQueryString(query)}`),
    create: (input: { project_id: string; title: string; description?: string; external_references?: string[]; labels?: string[]; sprint?: string; fix_version?: string; release?: string; iteration_id?: string; priority?: number; status?: string; additional_fields?: Record<string, unknown> }) =>
      request<{ id: string; status_warning?: { code: string; message: string; requested_status?: string | null; current_status?: string | null; issue_key?: string | null } }>("/requirements", { method: "POST", body: JSON.stringify(input) }),
    get: (id: string, query?: { project_id?: string }) =>
      request<Requirement>(`/requirements/${id}${toQueryString(query)}`),
    previewImpact: (id: string, input: { project_id: string; proposed_change?: Record<string, unknown> }) =>
      request<RequirementImpactPreviewResponse>(`/requirements/${id}/ai-impact-preview`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    rephraseDescription: (input: {
      project_id: string;
      integration_id?: string;
      description?: string;
      description_html?: string;
      requirement?: {
        id?: string | null;
        display_id?: string | null;
        title?: string | null;
        status?: string | null;
        priority?: number | null;
        labels?: string[];
        sprint?: string | null;
        fix_version?: string | null;
        release?: string | null;
        iteration_id?: string | null;
        external_references?: string[];
      };
    }) =>
      request<AiRequirementDescriptionRephraseResponse>("/requirements/ai-description-rephrase", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    bulkImport: (input: { project_id: string; rows: Array<Record<string, unknown>> }) =>
      request<BatchQueueResponse>("/requirements/import", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    exportRequirements: (input: { project_id: string; requirement_ids?: string[]; format?: "csv" | "json" }) =>
      request<BatchQueueResponse>("/requirements/export", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    previewCreation: (input: { project_id: string; integration_id?: string; model?: string; additional_context?: string; external_links?: string[]; images?: AiDesignImageInput[]; priority?: number; status?: string; max_requirements?: number }) =>
      request<AiRequirementCreationPreviewResponse>("/requirements/ai-create-preview", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    createGenerationJob: (input: { project_id: string; integration_id?: string; model?: string; additional_context?: string; external_links?: string[]; images?: AiDesignImageInput[]; priority?: number; status?: string; max_requirements?: number }) =>
      request<AiRequirementGenerationJobResponse>("/requirements/ai-create-jobs", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    getGenerationJob: (id: string, query?: { project_id?: string }) =>
      request<AiRequirementGenerationJobResponse>(`/requirements/ai-create-jobs/${id}${toQueryString(query)}`),
    listGenerationJobs: (query?: { project_id?: string; status?: string; limit?: number }) =>
      request<AiRequirementGenerationJobResponse[]>(`/requirements/ai-create-jobs${toQueryString(query)}`),
    previewDesignedTestCases: (id: string, input: { app_type_id: string; integration_id?: string; max_cases?: number; additional_context?: string; external_links?: string[]; images?: AiDesignImageInput[] }) =>
      request<AiDesignPreviewResponse>(`/requirements/${id}/design-test-cases-preview`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    acceptDesignedTestCases: (id: string, input: { app_type_id: string; status?: string; cases: Array<{ title: string; description?: string | null; priority?: number; requirement_ids?: string[]; steps?: Array<{ step_order?: number; action?: string | null; expected_result?: string | null }> }> }) =>
      request<{ accepted: number; created: Array<{ id: string; title: string; step_count: number; requirement_ids: string[] }> }>(`/requirements/${id}/design-test-cases-accept`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    previewOptimization: (id: string, input?: { integration_id?: string; model?: string; additional_context?: string; external_links?: string[]; images?: AiDesignImageInput[]; requirement_id?: string; selected_requirement_id?: string; single_requirement_only?: boolean; requirement_context?: Record<string, unknown> }) =>
      request<{
        requirement: { id: string; title: string; description?: string; status?: string; priority?: number; external_references?: string[] };
        integration: { id: string; name: string; type: string; model?: string | null } | null;
        suggestion: {
          title: string;
          description: string;
          external_references: string[];
          priority: number;
          status: string;
          acceptance_criteria: string[];
          risks: string[];
          open_questions: string[];
          change_summary: string[];
        };
        fallback_used: boolean;
        fallback_reason?: string | null;
      }>(`/requirements/${id}/ai-optimize-preview`, {
        method: "POST",
        body: JSON.stringify(input || {})
      }),
    generateTestCases: (id: string, input: { app_type_id: string; integration_id?: string; max_cases?: number; status?: string; additional_context?: string; external_links?: string[]; images?: AiDesignImageInput[] }) =>
      request<{ generated: number; created: Array<{ id: string; title: string; step_count: number }>; integration: { id: string; name: string; type: string; model?: string | null } }>(`/requirements/${id}/generate-test-cases`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    update: (id: string, input: Partial<{ project_id: string; title: string; description: string; external_references: string[]; labels: string[]; sprint: string; fix_version: string; release: string; iteration_id: string; priority: number; status: string; expected_revision: number }>) =>
      request<{ updated: boolean; revision: number }>(`/requirements/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/requirements/${id}`, { method: "DELETE" })
  },
  requirementIterations: {
    list: (query?: { project_id?: string }) =>
      request<RequirementIteration[]>(`/requirement-iterations${toQueryString(query)}`),
    get: (id: string) =>
      request<RequirementIteration>(`/requirement-iterations/${id}`),
    create: (input: { project_id: string; name: string; description?: string; requirement_ids?: string[]; jira_sprint_id?: string; jira_sprint_name?: string }) =>
      request<{ id: string }>("/requirement-iterations", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ name: string; description: string; requirement_ids: string[]; jira_sprint_id: string; jira_sprint_name: string }>) =>
      request<{ updated: boolean }>(`/requirement-iterations/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    assignRequirements: (id: string, requirement_ids: string[], append = true) =>
      request<{ updated: boolean; assigned: number }>(`/requirement-iterations/${id}/requirements`, {
        method: "PUT",
        body: JSON.stringify({ requirement_ids, append })
      }),
    removeRequirements: (id: string, requirement_ids: string[]) =>
      request<{ updated: boolean; removed: number }>(`/requirement-iterations/${id}/requirements`, {
        method: "DELETE",
        body: JSON.stringify({ requirement_ids })
      }),
    delete: (id: string) => request<{ deleted: boolean }>(`/requirement-iterations/${id}`, { method: "DELETE" })
  },
  knowledgeRepo: {
    list: (projectId: string) => request<any[]>(`/projects/${projectId}/knowledge`),
    contextPackage: (projectId: string, query?: { app_type_id?: string; query?: string; asset_type?: string; priority?: string }) =>
      request<{ project_id: string; knowledge: any[]; related_context?: any[] }>(
        `/projects/${projectId}/knowledge/context-package${toQueryString(query)}`
      ),
    create: (projectId: string, input: any) => request<any>(`/projects/${projectId}/knowledge`, { method: "POST", body: JSON.stringify(input) }),
    update: (projectId: string, id: string, input: any) => request<any>(`/projects/${projectId}/knowledge/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (projectId: string, id: string) => request<{ success: boolean }>(`/projects/${projectId}/knowledge/${id}`, { method: "DELETE" })
  },
  issues: {
    list: (query?: { project_id?: string; user_id?: string; status?: string; q?: string; page_size?: number; cursor?: string; projection?: "summary" | "detail" }) =>
      request<Issue[]>(`/feedback${toQueryString(query)}`),
    get: (id: string, query?: { project_id?: string }) =>
      request<Issue>(`/feedback/${id}${toQueryString(query)}`),
    createMetadata: (query?: { project_id?: string }) =>
      request<JiraBugCreateMetadata>(`/feedback/create-metadata${toQueryString(query)}`),
    create: (input: IssuePayload) =>
      request<{ id: string }>("/feedback", { method: "POST", body: JSON.stringify(input) }),
    previewAiDraft: (input: {
      project_id: string;
      intent: string;
      additional_context?: string;
      evidence?: string;
      external_links?: string[];
      reference_photos?: Array<{ name?: string | null }>;
      linked_test_run_id?: string;
      linked_test_case_ids?: string[];
      linked_requirement_ids?: string[];
      model?: string;
    }) => request<import("../types").AiBugDraftPreview>("/feedback/ai-draft-preview", {
      method: "POST",
      body: JSON.stringify(input)
    }),
    update: (id: string, input: Partial<IssuePayload>) =>
      request<{ updated: boolean }>(`/feedback/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/feedback/${id}`, { method: "DELETE" })
  },
  integrations: {
    list: (query?: { type?: Integration["type"]; is_active?: boolean }) =>
      request<Integration[]>(`/integrations${toQueryString(query)}`),
    create: (input: { type: Integration["type"]; name: string; base_url?: string; api_key?: string; model?: string; project_key?: string; username?: string; config?: Record<string, unknown>; is_active?: boolean }) =>
      request<{ id: string }>("/integrations", { method: "POST", body: JSON.stringify(input) }),
    testConnection: (input: { type: Integration["type"]; base_url?: string; api_key?: string; config?: Record<string, unknown> }) =>
      request<
        | {
            ok: boolean;
            type: "testengine";
            base_url: string;
            health_url: string;
            capabilities_url: string;
            latency_ms: number;
            service: string;
            runner: string;
            ui: string;
            control_plane: string;
            execution_scope: string;
            supported_step_types: string[];
            supported_web_engines: string[];
            qaira_result_log_compatibility?: string | null;
          }
        | {
            ok: boolean;
            type: "ops";
            base_url: string;
            health_url: string;
            events_url: string;
            board_url: string;
            latency_ms: number;
            service: string;
            events_path: string;
          }
      >("/integrations/test-connection", { method: "POST", body: JSON.stringify(input) }),
	    update: (id: string, input: Partial<{ type: Integration["type"]; name: string; base_url: string; api_key: string; model: string; project_key: string; username: string; config: Record<string, unknown>; is_active: boolean }>) =>
	      request<{ updated: boolean }>(`/integrations/${id}`, { method: "PUT", body: JSON.stringify(input) }),
	    export: () =>
	      request<{ version: number; exported_at: string; integrations: Integration[]; transaction_id?: string; artifact_id?: string }>("/integrations/export"),
	    import: (input: { integrations: Integration[] }) =>
	      request<{ imported: number; updated: number; failed: number; transaction_id?: string; failures: Array<{ name: string; error: string }> }>("/integrations/import", {
	        method: "POST",
	        body: JSON.stringify(input)
	      }),
	    delete: (id: string) => request<{ deleted: boolean }>(`/integrations/${id}`, { method: "DELETE" })
	  },
  requirementTestCases: {
    list: (query?: { requirement_id?: string; test_case_id?: string }) =>
      request<Array<{ requirement_id: string; test_case_id: string }>>(`/requirement-test-cases${toQueryString(query)}`),
    replace: (requirement_id: string, test_case_ids: string[]) =>
      request<{ updated: boolean; mapped: number }>(`/requirement-test-cases/replace`, {
        method: "PUT",
        body: JSON.stringify({ requirement_id, test_case_ids })
      })
  },
  requirementDefects: {
    list: (query?: { requirement_id?: string; issue_id?: string }) =>
      request<Array<{ requirement_id: string; issue_id: string; link_source: string; created_at?: string }>>(`/requirement-defects${toQueryString(query)}`),
    replace: (requirement_id: string, issue_ids: string[]) =>
      request<{ updated: boolean; mapped: number }>("/requirement-defects/replace", {
        method: "PUT",
        body: JSON.stringify({ requirement_id, issue_ids })
      })
  },
  testCaseDefects: {
    list: (query?: { test_case_id?: string; issue_id?: string }) =>
      request<Array<{ test_case_id: string; issue_id: string; link_source: string; created_at?: string }>>(`/test-case-defects${toQueryString(query)}`),
    listIssues: (test_case_id: string) =>
      request<TestCaseDefectLink[]>(`/test-case-defects/${test_case_id}/issues`),
    replace: (test_case_id: string, issue_ids: string[]) =>
      request<{ updated: boolean; mapped: number }>("/test-case-defects/replace", {
        method: "PUT",
        body: JSON.stringify({ test_case_id, issue_ids })
      })
  },
  testCaseModules: {
    list: (query?: { app_type_id?: string }) =>
      request<TestCaseModule[]>(`/test-case-modules${toQueryString(query)}`),
    get: (id: string) =>
      request<TestCaseModule>(`/test-case-modules/${id}`),
    listCases: (id: string) =>
      request<TestCase[]>(`/test-case-modules/${id}/test-cases`),
    create: (input: { app_type_id: string; name: string; description?: string; test_case_ids?: string[] }) =>
      request<{ id: string }>("/test-case-modules", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ name: string; description: string; test_case_ids: string[] }>) =>
      request<{ updated: boolean }>(`/test-case-modules/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    assignCases: (id: string, test_case_ids: string[], append = true) =>
      request<{ updated: boolean; assigned: number }>(`/test-case-modules/${id}/test-cases`, {
        method: "PUT",
        body: JSON.stringify({ test_case_ids, append })
      }),
    removeCases: (id: string, test_case_ids: string[]) =>
      request<{ updated: boolean; removed: number }>(`/test-case-modules/${id}/test-cases`, {
        method: "DELETE",
        body: JSON.stringify({ test_case_ids })
      }),
    delete: (id: string) => request<{ deleted: boolean }>(`/test-case-modules/${id}`, { method: "DELETE" })
  },
  testSuites: {
    list: (query?: { app_type_id?: string }) =>
      request<TestSuite[]>(`/test-suites${toQueryString(query)}`),
    create: (input: { app_type_id: string; name: string; labels?: string[]; parameter_values?: Record<string, string>; parallel_enabled?: boolean; parallel_count?: number }) =>
      request<{ id: string }>("/test-suites", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ name: string; labels: string[]; parameter_values: Record<string, string>; parallel_enabled: boolean; parallel_count: number; expected_revision: number }>) =>
      request<{ updated: boolean; revision: number }>(`/test-suites/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    assignTestCases: (id: string, test_case_ids: string[], expected_revision?: number, append = true) =>
      request<{ updated: boolean; assigned: number; revision: number }>(`/test-suites/${id}/assign-test-cases`, {
        method: "PUT",
        body: JSON.stringify({ test_case_ids, expected_revision, append })
      }),
    delete: (id: string) => request<{ deleted: boolean }>(`/test-suites/${id}`, { method: "DELETE" })
  },
  testCases: {
    list: (query?: { suite_id?: string; requirement_id?: string; status?: string; app_type_id?: string; page_size?: number; limit?: number; cursor?: string; projection?: "summary" | "detail" }) =>
      request<TestCase[]>(`/test-cases${toQueryString(query)}`),
    get: (id: string, query?: { project_id?: string }) =>
      request<TestCase>(`/test-cases/${id}${toQueryString(query)}`),
    create: (input: { app_type_id?: string; suite_id?: string; suite_ids?: string[]; title: string; description?: string; external_references?: string[]; labels?: string[]; parameter_values?: Record<string, string>; automated?: "yes" | "no"; automation_status?: "not_automated" | "ready" | "incomplete"; priority?: number; status?: string; requirement_id?: string; requirement_ids?: string[]; reviewer_id?: string | null; review_status?: TestCase["review_status"]; ai_quality_score?: number | null; steps?: Array<{ step_order?: number; action?: string; expected_result?: string; step_type?: TestStep["step_type"]; automation_code?: string; api_request?: TestStep["api_request"]; group_id?: string; group_name?: string; group_kind?: "local" | "reusable"; reusable_group_id?: string }> }) =>
      request<{ id: string }>("/test-cases", { method: "POST", body: JSON.stringify(input) }),
    previewImpact: (id: string, input: { project_id: string; proposed_change?: Record<string, unknown> }) =>
      request<TestCaseImpactPreviewResponse>(`/test-cases/${id}/ai-impact-preview`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    previewCaseAuthoring: (input: {
      app_type_id: string;
      requirement_id: string;
      integration_id?: string;
      additional_context?: string;
      external_links?: string[];
      images?: AiDesignImageInput[];
      test_case?: {
        title?: string;
        description?: string;
        parameter_values?: Record<string, string>;
        steps?: Array<{
          step_order?: number;
          step_type?: TestStep["step_type"];
          action?: string | null;
          expected_result?: string | null;
        }>;
      };
    }) =>
      request<AiCaseAuthoringPreviewResponse>("/test-cases/ai-authoring-preview", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    rephraseStep: (input: {
      app_type_id: string;
      requirement_id?: string;
      integration_id?: string;
      additional_context?: string;
      test_case?: {
        title?: string;
        description?: string;
        parameter_values?: Record<string, string>;
      };
      step: {
        step_order?: number;
        step_type?: TestStep["step_type"];
        action?: string | null;
        expected_result?: string | null;
      };
    }) =>
      request<AiStepRephraseResponse>("/test-cases/ai-step-rephrase", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    previewDesignedCases: (input: { app_type_id: string; requirement_ids: string[]; integration_id?: string; max_cases?: number; additional_context?: string; external_links?: string[]; images?: AiDesignImageInput[] }) =>
      request<AiDesignPreviewResponse>("/test-cases/design-test-cases-preview", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    acceptDesignedCases: (input: { app_type_id: string; requirement_ids: string[]; status?: string; cases: Array<{ title: string; description?: string | null; priority?: number; requirement_ids?: string[]; steps?: Array<{ step_order?: number; action?: string | null; expected_result?: string | null }> }> }) =>
      request<{ accepted: number; created: Array<{ id: string; title: string; step_count: number; requirement_ids: string[] }> }>("/test-cases/design-test-cases-accept", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    listGenerationJobs: (query: { app_type_id: string; status?: string }) =>
      request<AiTestCaseGenerationJob[]>(`/test-cases/ai-generation-jobs${toQueryString(query)}`),
    createGenerationJob: (input: {
      app_type_id: string;
      requirement_ids: string[];
      integration_id?: string;
      max_cases_per_requirement?: number;
      parallel_requirement_limit?: number;
      additional_context?: string;
      external_links?: string[];
      images?: AiDesignImageInput[];
    }) =>
      request<{ id: string }>("/test-cases/ai-generation-jobs", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    acceptGeneratedCase: (id: string) =>
      request<{ accepted: boolean }>(`/test-cases/${id}/accept-generated`, {
        method: "POST"
      }),
    rejectGeneratedCase: (id: string) =>
      request<{ deleted: boolean }>(`/test-cases/${id}/reject-generated`, {
        method: "DELETE"
      }),
    bulkImport: (input: {
      app_type_id: string;
      requirement_id?: string;
      import_source?: TestCaseImportSourceValue;
      rows?: Array<Record<string, unknown>>;
      batches?: TestCaseImportBatchInput[];
    }) => {
      const payloads = splitTestCaseImportInput(input);

      return Promise.all(
        payloads.map((payload) =>
          request<BatchQueueResponse>("/test-cases/import", {
            method: "POST",
            body: JSON.stringify(payload)
          })
        )
      ).then((responses) => {
        const first = responses[0];

        return {
          ...first,
          transaction_ids: responses.map((response) => response.transaction_id),
          job_ids: responses.map((response) => response.job_id).filter(Boolean) as string[],
          split_count: responses.length
        };
      });
    },
    exportCases: (input: { app_type_id: string; test_case_ids?: string[] }) =>
      request<BatchQueueResponse>("/test-cases/export", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    learningCache: (query?: { project_id?: string; app_type_id?: string; limit?: number; offset?: number }) =>
      request<AutomationLearningCacheEntry[]>(`/test-cases/automation/learning-cache${toQueryString(query)}`),
    repositoryContext: (query?: { project_id?: string; app_type_id?: string; limit?: number }) =>
      request<ObjectRepositoryContext>(`/test-cases/automation/repository-context${toQueryString(query)}`),
    exportLearningCacheCsv: (query: { app_type_id: string }) =>
      requestBlob(`/test-cases/automation/learning-cache/export.csv${toQueryString(query)}`),
    importLearningCacheEntries: async (input: {
      app_type_id: string;
      import_source?: string;
      entries: ObjectRepositoryImportEntry[];
    }) =>
      request<ObjectRepositoryImportResult>("/test-cases/automation/learning-cache/import", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    extractLearningCacheFields: (input: {
      app_type_id?: string;
      screen_name: string;
      page_url?: string;
      dom_structure?: string;
      screenshot_url?: string;
      business_meaning?: string;
      candidate_fields?: unknown[];
      integration_id?: string;
    }) =>
      request<{
        screen_summary?: string | null;
        intended_flows: string[];
        fields: Array<{
          name: string;
          tag: string;
          role: string;
          locator: string;
          locatorKind: string;
          dom: string;
          fallbackLocators: Array<{ locator: string; strategy: string; confidenceScore: number }>;
          description?: string | null;
          businessMeaning?: string | null;
          usageKeywords?: string[];
        }>;
        ai_used: boolean;
        fallback_used: boolean;
        fallback_reason?: string | null;
      }>("/test-cases/automation/learning-cache/extract-fields", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    createLearningCacheEntry: (input: Partial<{
      project_id: string;
      app_type_id: string;
      page_url: string;
      page_key: string;
      locator_intent: string;
      locator: string;
      locator_kind: string;
      confidence: number;
      source: string;
      screen_name: string;
      object_name: string;
      object_role: string;
      target_criteria: string[];
      dom_structure: string;
      screenshot_url: string;
      fallback_strategy: string;
      screen_dom_compressed: string;
      screen_screenshot_url: string;
      metadata: Record<string, unknown>;
    }>) =>
      request<AutomationLearningCacheEntry>("/test-cases/automation/learning-cache", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    updateLearningCacheEntry: (id: string, input: Partial<{
      page_url: string;
      page_key: string;
      locator_intent: string;
      locator: string;
      locator_kind: string;
      confidence: number;
      source: string;
      screen_name: string;
      object_name: string;
      object_role: string;
      target_criteria: string[];
      dom_structure: string;
      dom_path: string;
      screenshot_url: string;
      screenshot_path: string;
      fallback_strategy: string;
      platform: string;
      url_pattern_type: string;
      url_pattern_value: string;
      screen_fingerprint: string;
      accessibility_tree: string;
      fallback_locators: Array<Record<string, unknown>>;
      description: string;
      business_meaning: string;
      usage_keywords: string[];
      stability_score: number;
      last_validated_at: string;
      validation_history: Array<Record<string, unknown>>;
      ancestor_dom: string;
      ancestor_screenshot_url: string;
      element_screenshot_url: string;
      metadata: Record<string, unknown>;
    }>) =>
      request<AutomationLearningCacheEntry>(`/test-cases/automation/learning-cache/${id}`, {
        method: "PUT",
        body: JSON.stringify(input)
      }),
    improveLearningCacheEntry: (id: string, input?: { integration_id?: string; guidance?: string }) =>
      request<{
        entry: AutomationLearningCacheEntry;
        suggestion: { locator?: string; strategy?: string; confidence?: number; reason?: string };
        fallback_used: boolean;
        fallback_reason?: string | null;
        generation_mode?: "deterministic" | "llm";
        generated_at?: string;
        request_id?: string;
        requires_human_review?: boolean;
        provenance?: { provider?: string; model?: string | null; evidence?: string[]; confidence?: number };
      }>(`/test-cases/automation/learning-cache/${id}/ai-improve`, {
        method: "POST",
        body: JSON.stringify(input || {})
      }),
    applyLearningCacheImprovement: (id: string, input: { confirmed: true; locator: string; strategy: string; confidence?: number; request_id?: string }) =>
      request<{ entry: AutomationLearningCacheEntry; applied: boolean }>(`/test-cases/automation/learning-cache/${id}/ai-improve/apply`, {
        method: "PUT",
        body: JSON.stringify(input)
      }),
    learningCacheUsage: (id: string) =>
      request<Array<{ id: string; display_id?: string | null; title: string; automated?: "yes" | "no" | null }>>(`/test-cases/automation/learning-cache/${id}/usage`),
    learningCacheScreenUsage: (screenName: string, query: { app_type_id?: string }) =>
      request<Array<{ id: string; display_id?: string | null; title: string; automated?: "yes" | "no" | null }>>(`/test-cases/automation/learning-cache/screens/${encodeURIComponent(screenName)}/usage${toQueryString(query)}`),
    deleteLearningCacheEntry: (id: string, confirmed = false) =>
      request<{ deleted: boolean; requires_confirmation: boolean; usage: Array<{ id: string; display_id?: string | null; title: string; automated?: "yes" | "no" | null }>; invalidated_cases: Array<{ id: string; title: string }> }>(`/test-cases/automation/learning-cache/${id}${toQueryString(confirmed ? { confirm: "true" } : undefined)}`, { method: "DELETE" }),
    deleteLearningCacheScreen: (screenName: string, query: { app_type_id?: string; confirm?: string }) =>
      request<{ deleted: boolean; requires_confirmation: boolean; usage: Array<{ id: string; display_id?: string | null; title: string; automated?: "yes" | "no" | null }>; invalidated_cases: Array<{ id: string; title: string }> }>(`/test-cases/automation/learning-cache/screens/${encodeURIComponent(screenName)}${toQueryString(query)}`, { method: "DELETE" }),
    renameLearningCacheScreen: (screenName: string, input: { app_type_id?: string; new_name: string }) =>
      request<{ renamed: boolean; screen_name: string; updated_fields: number; updated_step_references: number }>(`/test-cases/automation/learning-cache/screens/${encodeURIComponent(screenName)}`, {
        method: "PUT",
        body: JSON.stringify({ ...input, screen_name: input.new_name })
      }),
    buildAutomation: (id: string, input?: { integration_id?: string; start_url?: string; additional_context?: string; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; captured_actions?: unknown[]; captured_network?: unknown[] }) =>
      request<AutomationBuildResponse>(`/test-cases/${id}/automation/build`, {
        method: "POST",
        body: JSON.stringify(input || {})
      }),
    queueAutomationGenerator: (id: string, input?: { integration_id?: string; start_url?: string; additional_context?: string; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; ai_requested?: boolean }) =>
      request<BatchQueueResponse>(`/test-cases/${id}/automation/generator-jobs`, {
        method: "POST",
        body: JSON.stringify(input || {})
      }),
    buildAutomationBatch: (input: { app_type_id: string; test_case_ids?: string[]; integration_id?: string; start_url?: string; additional_context?: string; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; failure_threshold?: number; ai_requested?: boolean }) =>
      request<BatchQueueResponse>("/test-cases/automation/build-batch", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    startRecorderSession: (id: string, input?: { start_url?: string; recorder_mode?: "local" | "remote"; recorder_target?: "web" | "mobile"; engine_base_url?: string; recorder_public_base_url?: string; reuse_existing?: boolean; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; target_step_id?: string }) =>
      request<RecorderSessionResponse>(`/test-cases/${id}/automation/recorder-session`, {
        method: "POST",
        body: JSON.stringify(input || {})
      }),
    finishRecorderSession: (id: string, sessionId: string, input?: { transaction_id?: string; integration_id?: string; additional_context?: string; recorder_mode?: "local" | "remote"; recorder_target?: "web" | "mobile"; engine_base_url?: string; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; target_step_id?: string }) =>
      request<AutomationBuildResponse & { recorder_session?: { id: string; action_count: number; network_count: number } }>(`/test-cases/${id}/automation/recorder-session/${sessionId}/finish`, {
        method: "POST",
        body: JSON.stringify(input || {})
      }),
    update: (id: string, input: Partial<{ app_type_id: string; suite_id: string; suite_ids: string[]; title: string; description: string; external_references: string[]; labels: string[]; parameter_values: Record<string, string>; automated: "yes" | "no"; automation_status: "not_automated" | "ready" | "incomplete"; priority: number; status: string; requirement_id: string; requirement_ids: string[]; reviewer_id: string | null; review_status: TestCase["review_status"]; review_history: TestCase["review_history"]; ai_quality_score: number | null; expected_revision: number; steps: Array<{ id?: string; test_case_id?: string; step_order?: number; action?: string | null; expected_result?: string | null; step_type?: TestStep["step_type"]; automation_code?: string | null; api_request?: TestStep["api_request"]; group_id?: string | null; group_name?: string | null; group_kind?: "local" | "reusable" | null; reusable_group_id?: string | null }> }>) =>
      request<{ updated: boolean; revision: number }>(`/test-cases/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    review: (id: string, input: { review_status: "pending" | "accepted" | "changes_requested"; comment?: string }) =>
      request<{ updated: boolean; review: NonNullable<TestCase["review_history"]>[number] }>(`/test-cases/${id}/review`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    listVersions: (id: string) =>
      request<{ current_revision: number; retained_limit: number; versions: TestCaseVersionSummary[] }>(`/test-cases/${id}/versions`),
    getVersion: (id: string, revision: number) =>
      request<TestCaseVersionSnapshot>(`/test-cases/${id}/versions/${revision}`),
    restoreVersion: (id: string, revision: number, expectedRevision?: number) =>
      request<{ restored: boolean; restored_from_revision: number; revision: number }>(`/test-cases/${id}/versions/${revision}/restore`, {
        method: "POST",
        body: JSON.stringify({ expected_revision: expectedRevision })
      }),
    delete: (id: string) => request<{ deleted: boolean }>(`/test-cases/${id}`, { method: "DELETE" })
  },
  aiPromptTemplates: {
    list: (query: { project_id?: string; app_type_id?: string; scope?: string }) =>
      request<AiPromptTemplate[]>(`/ai-prompt-templates${toQueryString(query)}`),
    create: (input: Partial<AiPromptTemplate> & { project_id?: string; app_type_id?: string; name: string; prompt_text: string }) =>
      request<AiPromptTemplate>("/ai-prompt-templates", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    update: (id: string, input: Partial<AiPromptTemplate>) =>
      request<AiPromptTemplate>(`/ai-prompt-templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(input)
      }),
    delete: (id: string) =>
      request<{ deleted: boolean; id: string }>(`/ai-prompt-templates/${id}`, {
        method: "DELETE"
      })
  },
  localAgent: {
    status: () =>
      request<{
        launch_supported: boolean;
        web: { ready: boolean; base_url: string | null; health?: Record<string, unknown> | null };
        mobile: { ready: boolean; base_url: string | null; health?: Record<string, unknown> | null };
        appium: { ready: boolean; base_url: string | null; health?: Record<string, unknown> | null };
        recommended: {
          web_public_base_url: string;
          mobile_public_base_url: string;
          appium_server_url: string;
        };
      }>("/local-agent/status"),
    start: (input?: { target?: "playwright" | "web" }) =>
      request<{
        started: boolean;
        launch_supported: boolean;
        already_running?: boolean;
        base_url?: string;
        pid?: number;
        message: string;
      }>("/local-agent/start", {
        method: "POST",
        body: JSON.stringify(input || {})
      })
  },
  suiteTestCases: {
    list: (query?: { suite_id?: string; test_case_id?: string }) =>
      request<Array<{ suite_id: string; test_case_id: string; sort_order: number }>>(`/suite-test-cases${toQueryString(query)}`),
    reorder: (suite_id: string, test_case_ids: string[], expected_revision?: number) =>
      request<{ reordered: boolean; revision: number }>(`/suite-test-cases/reorder`, {
        method: "PUT",
        body: JSON.stringify({ suite_id, test_case_ids, expected_revision })
      })
  },
  testSteps: {
    list: (query?: { test_case_id?: string; test_case_ids?: string }) =>
      request<TestStep[]>(`/test-steps${toQueryString(query)}`),
    runApiRequest: (input: { api_request: TestStep["api_request"] }) =>
      request<ApiRequestPreview>("/test-steps/run-api-request", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    create: (input: { test_case_id: string; step_order: number; action?: string; expected_result?: string; step_type?: TestStep["step_type"]; automation_code?: string; api_request?: TestStep["api_request"]; group_id?: string; group_name?: string; group_kind?: "local" | "reusable"; reusable_group_id?: string }) =>
      request<{ id: string }>("/test-steps", { method: "POST", body: JSON.stringify(input) }),
    createMany: (input: {
      test_case_id: string;
      insertion_index: number;
      steps: Array<{ action?: string; expected_result?: string; step_type?: TestStep["step_type"]; automation_code?: string; api_request?: TestStep["api_request"]; group_id?: string; group_name?: string; group_kind?: "local" | "reusable"; reusable_group_id?: string }>;
    }) => request<{ ids: string[]; created: number }>("/test-steps/bulk", { method: "POST", body: JSON.stringify(input) }),
    deleteMany: (input: { test_case_id: string; step_ids: string[] }) =>
      request<{ deleted: number }>("/test-steps/bulk-delete", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ test_case_id: string; step_order: number; action: string; expected_result: string; step_type: TestStep["step_type"] | null; automation_code: string; api_request: TestStep["api_request"]; group_id: string | null; group_name: string | null; group_kind: "local" | "reusable" | null; reusable_group_id: string | null }>) =>
      request<{ updated: boolean }>(`/test-steps/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    reorder: (test_case_id: string, step_ids: string[]) =>
      request<{ reordered: boolean }>(`/test-steps/reorder`, {
        method: "PUT",
        body: JSON.stringify({ test_case_id, step_ids })
      }),
    duplicate: (input: { test_case_id: string; step_ids: string[]; insert_after_step_id?: string }) =>
      request<{ duplicated: boolean }>("/test-steps/duplicate", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    group: (input: { test_case_id: string; step_ids: string[]; name: string; kind?: "local" | "reusable"; group_id?: string; reusable_group_id?: string }) =>
      request<{ grouped: boolean; group_id: string }>("/test-steps/group", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    ungroup: (input: { test_case_id: string; group_id: string }) =>
      request<{ updated: boolean }>("/test-steps/ungroup", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    insertSharedGroup: (input: { test_case_id: string; shared_step_group_id: string; insert_after_step_id?: string }) =>
      request<{ inserted: boolean }>("/test-steps/insert-shared-group", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    delete: (id: string) => request<{ deleted: boolean }>(`/test-steps/${id}`, { method: "DELETE" })
  },
  sharedStepGroups: {
    list: (query?: { app_type_id?: string }) =>
      request<SharedStepGroup[]>(`/shared-step-groups${toQueryString(query)}`),
    get: (id: string) =>
      request<SharedStepGroup>(`/shared-step-groups/${id}`),
    create: (input: { app_type_id: string; name: string; description?: string; parameter_values?: Record<string, string>; steps?: Array<{ step_order?: number; action?: string; expected_result?: string; step_type?: TestStep["step_type"]; automation_code?: string; api_request?: TestStep["api_request"] }> }) =>
      request<{ id: string }>("/shared-step-groups", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ app_type_id: string; name: string; description: string; parameter_values: Record<string, string>; steps: Array<{ step_order?: number; action?: string; expected_result?: string; step_type?: TestStep["step_type"]; automation_code?: string; api_request?: TestStep["api_request"] }> }>) =>
      request<SharedStepGroup>(`/shared-step-groups/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/shared-step-groups/${id}`, { method: "DELETE" })
  },
  testEnvironments: {
    list: (query?: { project_id?: string; app_type_id?: string }) =>
      request<TestEnvironment[]>(`/test-environments${toQueryString(query)}`),
    create: (input: { project_id: string; app_type_id?: string; name: string; description?: string; base_url?: string; variables?: KeyValueEntry[] }) =>
      request<{ id: string }>("/test-environments", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ project_id: string; app_type_id: string; name: string; description: string; base_url: string; variables: KeyValueEntry[] }>) =>
      request<TestEnvironment>(`/test-environments/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/test-environments/${id}`, { method: "DELETE" })
  },
  testConfigurations: {
    list: (query?: { project_id?: string; app_type_id?: string }) =>
      request<TestConfiguration[]>(`/test-configurations${toQueryString(query)}`),
    create: (input: { project_id: string; app_type_id?: string; name: string; description?: string; browser?: string; mobile_os?: string; platform_version?: string; variables?: KeyValueEntry[] }) =>
      request<{ id: string }>("/test-configurations", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ project_id: string; app_type_id: string; name: string; description: string; browser: string; mobile_os: string; platform_version: string; variables: KeyValueEntry[] }>) =>
      request<TestConfiguration>(`/test-configurations/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/test-configurations/${id}`, { method: "DELETE" })
  },
  testDataSets: {
    list: (query?: { project_id?: string; app_type_id?: string }) =>
      request<TestDataSet[]>(`/test-data-sets${toQueryString(query)}`),
    create: (input: { project_id: string; app_type_id?: string; name: string; description?: string; mode: TestDataSetMode; columns?: string[]; rows?: Array<Record<string, string>> }) =>
      request<{ id: string }>("/test-data-sets", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ project_id: string; app_type_id: string; name: string; description: string; mode: TestDataSetMode; columns: string[]; rows: Array<Record<string, string>> }>) =>
      request<TestDataSet>(`/test-data-sets/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    previewAiData: (input: { project_id: string; app_type_id?: string; prompt: string; field_context?: string; sample_count?: number; prompt_instruction?: string; integration_id?: string }) =>
      request<AiTestDataGenerationPreviewResponse>("/test-data-sets/ai-generate-preview", { method: "POST", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/test-data-sets/${id}`, { method: "DELETE" })
  },
  executions: {
    list: (query?: { project_id?: string; app_type_id?: string; status?: string; test_case_id?: string; page_size?: number }) =>
      request<Execution[]>(`/executions${toQueryString(query)}`),
    history: (query: { project_id: string; app_type_id?: string; requirement_id?: string; test_case_id?: string; page_size?: number }) =>
      request<import("../types").TraceabilityRunHistoryItem[]>(`/executions/history${toQueryString(query)}`),
    get: (id: string) =>
      request<Execution>(`/executions/${id}`),
    previewFailureClusters: (id: string, input: { project_id: string; scope?: string }) =>
      request<ExecutionFailureClusterPreviewResponse>(`/executions/${id}/ai-failure-clusters`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    previewSmartPlan: (input: { project_id: string; app_type_id: string; integration_id?: string; release_scope?: string; additional_context?: string; impacted_requirement_ids?: string[]; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string }) =>
      request<SmartExecutionPreviewResponse>("/executions/smart-plan-preview", { method: "POST", body: JSON.stringify(input) }),
    create: (input: { project_id: string; app_type_id?: string; suite_ids?: string[]; test_case_ids?: string[]; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; execution_hooks?: Array<Record<string, unknown>>; parallel_enabled?: boolean; parallel_count?: number; execution_mode?: "manual" | "remote" | "local"; engine_base_url?: string; assigned_to?: string; assigned_to_ids?: string[]; release?: string; sprint?: string; build?: string; name?: string; created_by: string }) =>
      request<{ id: string }>("/executions", { method: "POST", body: JSON.stringify(input) }),
    createLocalRun: (input: { project_id: string; app_type_id: string; test_case_ids: string[]; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; execution_hooks?: Array<Record<string, unknown>>; assigned_to?: string; assigned_to_ids?: string[]; release?: string; sprint?: string; build?: string; name?: string; created_by: string; engine_base_url?: string }) =>
      request<ExecutionStartResponse & { id: string; execution_mode: "local"; engine_base_url: string }>("/executions/local-run", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: { assigned_to?: string; assigned_to_ids?: string[]; release?: string; sprint?: string; build?: string; expected_revision?: number }) =>
      request<{ updated: boolean; revision: number }>(`/executions/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    runApiStep: (executionId: string, testCaseId: string, stepId: string) =>
      request<{
        execution_id: string;
        test_case_id: string;
        step_id: string;
        step_status: "passed" | "failed" | null;
        case_status: ExecutionResult["status"];
        execution_status: Execution["status"];
        note: string;
        detail: import("../lib/executionLogs").ExecutionStepApiDetail | null;
        captures?: Record<string, string>;
        execution_result_id: string;
        queued_for_engine?: boolean;
        job_id?: string;
        engine_run_id?: string;
        transaction_id?: string;
        active_web_engine?: "playwright" | "selenium" | string;
        live_view_url?: string | null;
      }>(`/executions/${executionId}/cases/${testCaseId}/steps/${stepId}/run`, { method: "POST" }),
    analyzeCase: (executionId: string, testCaseId: string) =>
      request<{ recorded: boolean; execution_result_id?: string; analysis?: ExecutionAiAnalysis }>(
        `/executions/${executionId}/cases/${testCaseId}/ai-analysis`,
        { method: "POST" }
      ),
    updateCaseAssignment: (executionId: string, testCaseId: string, input: { assigned_to?: string; expected_revision?: number }) =>
      request<{ updated: boolean; revision: number }>(`/executions/${executionId}/cases/${testCaseId}/assignment`, { method: "PUT", body: JSON.stringify(input) }),
    rerun: (id: string, input: { failed_only?: boolean; created_by: string; name?: string }) =>
      request<{ id: string }>(`/executions/${id}/rerun`, { method: "POST", body: JSON.stringify(input) }),
    start: (id: string, input?: { execution_mode?: "local" | "remote"; engine_base_url?: string; expected_revision?: number }) =>
      request<ExecutionStartResponse>(`/executions/${id}/start`, { method: "POST", body: JSON.stringify(input || {}) }),
    downloadReportPdf: (id: string) => requestBlob(`/executions/${id}/report.pdf`),
    downloadCaseReportPdf: (executionId: string, testCaseId: string) =>
      requestBlob(`/executions/${executionId}/cases/${testCaseId}/report.pdf`),
    shareReport: (id: string, input: { recipients: string[] }) =>
      request<{ sent: boolean; recipients: number }>(`/executions/${id}/share-report`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    shareCaseReport: (executionId: string, testCaseId: string, input: { recipients: string[] }) =>
      request<{ sent: boolean; recipients: number }>(`/executions/${executionId}/cases/${testCaseId}/share-report`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    complete: (id: string, input: { status: "completed" | "failed" | "blocked" | "aborted"; expected_revision?: number }) =>
      request<{ completed: boolean; revision: number; status: Execution["status"]; counts?: { passed: number; failed: number; blocked: number; running: number; not_run: number; total: number } }>(`/executions/${id}/complete`, { method: "POST", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/executions/${id}`, { method: "DELETE" })
  },
  qualityGates: {
    previewAssessment: (id: string, input: { project_id: string; thresholds?: Record<string, number> }) =>
      request<QualityGateAssessmentPreviewResponse>(`/quality-gates/${id}/ai-assessment`, {
        method: "POST",
        body: JSON.stringify(input)
      })
  },
  executionSchedules: {
    list: (query?: { project_id?: string; app_type_id?: string; is_active?: boolean }) =>
      request<ExecutionSchedule[]>(`/execution-schedules${toQueryString(query)}`),
    get: (id: string) =>
      request<ExecutionSchedule>(`/execution-schedules/${id}`),
    create: (input: { project_id: string; app_type_id?: string; name?: string; cadence?: string; next_run_at?: string; suite_ids?: string[]; test_case_ids?: string[]; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; release?: string; sprint?: string; build?: string; assigned_to?: string; assigned_to_ids?: string[]; created_by: string }) =>
      request<{ id: string }>("/execution-schedules", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: { project_id?: string; app_type_id?: string; name?: string; cadence?: string; next_run_at?: string; suite_ids?: string[]; test_case_ids?: string[]; test_environment_id?: string; test_configuration_id?: string; test_data_set_id?: string; release?: string; sprint?: string; build?: string; assigned_to?: string; assigned_to_ids?: string[] }) =>
      request<ExecutionSchedule>(`/execution-schedules/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    run: (id: string) =>
      request<{ id: string }>(`/execution-schedules/${id}/run`, { method: "POST" }),
    delete: (id: string) => request<{ deleted: boolean }>(`/execution-schedules/${id}`, { method: "DELETE" })
  },
  agenticWorkflows: {
    list: (query?: { project_id?: string; app_type_id?: string; status?: string }) =>
      request<AgenticWorkflow[]>(`/agentic-workflows${toQueryString(query)}`),
    get: (id: string) =>
      request<AgenticWorkflow>(`/agentic-workflows/${id}`),
    create: (input: {
      project_id: string;
      app_type_id?: string;
      name: string;
      description?: string;
      status?: AgenticWorkflow["status"];
      trigger_kind?: AgenticWorkflow["trigger_kind"];
      nodes?: AgenticWorkflow["nodes"];
      edges?: AgenticWorkflow["edges"];
      settings?: Record<string, unknown>;
      n8n_payload?: Record<string, unknown>;
    }) =>
      request<AgenticWorkflow>("/agentic-workflows", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    update: (id: string, input: Partial<{
      project_id: string;
      app_type_id: string;
      name: string;
      description: string | null;
      status: AgenticWorkflow["status"];
      trigger_kind: AgenticWorkflow["trigger_kind"];
      nodes: AgenticWorkflow["nodes"];
      edges: AgenticWorkflow["edges"];
      settings: Record<string, unknown>;
      n8n_payload: Record<string, unknown>;
    }>) =>
      request<AgenticWorkflow>(`/agentic-workflows/${id}`, {
        method: "PUT",
        body: JSON.stringify(input)
      }),
    delete: (id: string) =>
      request<{ deleted: boolean }>(`/agentic-workflows/${id}`, { method: "DELETE" }),
    testApiAgent: (input: AgenticApiAgentTestInput) =>
      request<Record<string, unknown>>("/agentic-workflows/api-agent-test", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    run: (id: string, input?: { trigger_kind?: AgenticWorkflow["trigger_kind"]; input_payload?: Record<string, unknown> }) =>
      request<AgenticWorkflowRun>(`/agentic-workflows/${id}/runs`, {
        method: "POST",
        body: JSON.stringify(input || {})
      }),
    listRuns: (query?: { project_id?: string; app_type_id?: string; workflow_id?: string; status?: string }) =>
      request<AgenticWorkflowRun[]>(`/agentic-workflow-runs${toQueryString(query)}`),
    getRun: (id: string) =>
      request<AgenticWorkflowRun>(`/agentic-workflow-runs/${id}`)
  },
  executionResults: {
    list: (query?: { execution_id?: string; test_case_id?: string; app_type_id?: string }) =>
      request<ExecutionResult[]>(`/execution-results${toQueryString(query)}`),
    create: (input: { execution_id: string; test_case_id: string; app_type_id: string; status: ExecutionResult["status"]; duration_ms?: number; error?: string; logs?: string; external_references?: string[]; defects?: string[]; executed_by?: string }) =>
      request<{ id: string }>("/execution-results", { method: "POST", body: JSON.stringify(input) }),
    update: (id: string, input: Partial<{ status: ExecutionResult["status"]; duration_ms: number; error: string; logs: string; external_references: string[]; defects: string[] }>) =>
      request<{ updated: boolean }>(`/execution-results/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    linkStepDefects: (id: string, input: { step_id: string; defect_ids: string[] }) =>
      request<{ updated: boolean; revision: number; defects: string[]; step_defects: Record<string, string[]> }>(`/execution-results/${id}/defect-links`, { method: "PUT", body: JSON.stringify(input) }),
    delete: (id: string) => request<{ deleted: boolean }>(`/execution-results/${id}`, { method: "DELETE" })
  },
  workspaceTransactions: {
    list: (query?: { project_id?: string; app_type_id?: string; category?: string; include_global?: boolean; limit?: number }) =>
      request<WorkspaceTransaction[]>(`/workspace-transactions${toQueryString(query)}`),
    events: (id: string) =>
      request<WorkspaceTransactionEvent[]>(`/workspace-transactions/${id}/events`),
    artifacts: (id: string) =>
      request<WorkspaceTransactionArtifact[]>(`/workspace-transactions/${id}/artifacts`),
    downloadArtifact: (transactionId: string, artifactId: string) =>
      requestBlob(`/workspace-transactions/${transactionId}/artifacts/${artifactId}/download`),
    delete: (id: string) =>
      request<{ deleted: boolean }>(`/workspace-transactions/${id}`, { method: "DELETE" })
  },
  opsTelemetry: {
    clearLogs: (query?: { project_id?: string }) =>
      request<{ cleared: boolean; deleted: number; events_path: string }>(`/ops-telemetry/logs${toQueryString(query)}`, {
        method: "DELETE"
      })
  }
};

function toQueryString(query?: Record<string, string | number | boolean | undefined>) {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
