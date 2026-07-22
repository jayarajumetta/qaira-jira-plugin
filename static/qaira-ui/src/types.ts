export type User = {
  id: string;
  email: string;
  name: string | null;
  avatar_data_url?: string | null;
  role?: "admin" | "member";
  role_id?: string;
  role_name?: string;
  permissions?: string[];
  auth_provider?: "local" | "google";
  email_verified?: boolean;
  created_at?: string;
};

export type Role = {
  id: string;
  name: string;
  system?: boolean;
  permission_count?: number;
};

export type Permission = {
  id: string;
  code: string;
  description: string | null;
  level?: "read" | "write" | "manage";
  features?: Array<{ key: string; label: string; group: string; group_label: string; enabled?: boolean | null }>;
};

export type PermissionGroup = {
  key: string;
  label: string;
  permissions: Permission[];
};

export type ApiKeyScope =
  | "user"
  | "read"
  | "design"
  | "automation"
  | "runs"
  | "environment"
  | "integrations"
  | "admin";

export type ApiKeyScopeOption = {
  value: ApiKeyScope;
  label: string;
  description: string;
};

export type UserApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scope: ApiKeyScope;
  is_active: boolean;
  created_at?: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
};

export type FeatureFlagDefinition = {
  key: string;
  label: string;
  permissions?: string[];
  routes?: string[];
  group: string;
  group_label: string;
};

export type FeatureFlagGroup = {
  key: string;
  label: string;
  description: string;
  features: Array<Omit<FeatureFlagDefinition, "group" | "group_label">>;
};

export type FeatureFlagSnapshot = {
  groups: FeatureFlagGroup[];
  flags: Record<string, boolean>;
  local_flags: Record<string, boolean>;
  provider: {
    type: string;
    name?: string;
    source?: string;
    configured: boolean;
    connected: boolean;
    last_updated?: string | null;
  };
  updated_at?: string | null;
};

export type JiraAttachment = {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  created?: string | null;
  content?: string | null;
  thumbnail?: string | null;
  author?: {
    accountId?: string;
    displayName?: string;
    avatarUrls?: Record<string, string>;
  } | null;
};

export type QualityDashboardGadget = {
  id: string;
  title: string;
  data_source?: "jira" | "qaira";
  release?: string;
  type: "metric" | "donut" | "bar" | "stacked-bar" | "line" | "table";
  jql: string;
  group_by: "status" | "statusCategory" | "priority" | "issuetype" | "assignee" | "reporter" | "components" | "fixVersion" | "labels" | "sprint" | "resolution" | "module" | "createdWeek" | "updatedWeek" | "createdMonth" | "updatedMonth";
  metric?: "count" | "resolved" | "unresolved" | "highPriority" | "unassigned" | "overdue" | "stale30d" | "created30d" | "resolved30d" | "resolutionRate" | "averageAgeDays" | "averageResolutionDays" | "releaseConfidence" | "requirementCoverage" | "coverageGaps" | "automationCoverage" | "openDefects" | "failedRuns" | "executionCycleHours" | "completedRuns30d" | "testCases" | "testSuites" | "testRuns" | "moduleCaseCount";
  accent?: "blue" | "green" | "purple" | "orange" | "red" | "teal" | "slate";
};

export type QualityDashboard = {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  layout: "single" | "two-column" | "three-column";
  gadgets: QualityDashboardGadget[];
  revision?: number;
  created_at?: string;
  updated_at?: string;
};

export type QualityDashboardGadgetResult = {
  project: { id: string; key: string; name: string };
  jql: string;
  evaluated_at: string;
  gadget: QualityDashboardGadget;
  total: number;
  value: number;
  value_label: string;
  returned: number;
  truncated: boolean;
  series: Array<{ label: string; value: number }>;
  rows: Array<{ id: string; key: string; title: string; status: string | null; priority: string | null; type: string | null; assignee: string | null; updated: string | null }>;
  drilldown_target?: string;
  methodology?: string;
};

export type QualityDashboardBatchResponse = {
  project: { id: string; key: string; name: string };
  evaluated_at: string;
  results: Array<{
    gadget_id: string;
    result?: QualityDashboardGadgetResult;
    error?: { code: string; message: string; status: number };
  }>;
};

export type QualityDashboardDesignPreviewResponse = AiAssistedPreviewBase & {
  dashboard: QualityDashboard;
  templates: Array<{ id: "executive" | "product" | "quality" | "automation"; name: string; description: string; gadget_count: number }>;
  rationale: string[];
  preview_only: true;
  decision_requires_human_approval: true;
};

export type AdminHealthStatus = "ready" | "degraded" | "blocked";

export type AdminHealthCheck = {
  key: string;
  label: string;
  status: AdminHealthStatus;
  summary?: string | null;
  detail?: string | null;
  remediation?: string | null;
  metrics?: Record<string, string | number | boolean | null>;
};

export type AdminHealthSnapshot = {
  status: AdminHealthStatus;
  checked_at?: string | null;
  version?: string | null;
  checks?: AdminHealthCheck[];
  registry?: Omit<AdminHealthCheck, "key" | "label">;
  schema?: Omit<AdminHealthCheck, "key" | "label">;
  storage?: Omit<AdminHealthCheck, "key" | "label">;
  attachments?: Omit<AdminHealthCheck, "key" | "label">;
  permissions?: Omit<AdminHealthCheck, "key" | "label">;
};

export type AppNotification = {
  id: string;
  user_id: string;
  session_id?: string | null;
  project_id?: string | null;
  run_id?: string | null;
  target_url?: string | null;
  type: string;
  preference?: string | null;
  title: string;
  message: string;
  tone?: "error" | "warning" | "success" | "info" | "neutral" | string;
  status: "unread" | "read" | string;
  created_at?: string;
};

export type Project = {
  id: string;
  display_id?: string | null;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at?: string;
};

export type ProjectMember = {
  id: string;
  project_id: string;
  user_id: string;
  role_id: string;
  fallback_role_id?: string;
  assignment_source?: "jira-permission" | string;
  system_managed?: boolean;
  jira_admin_verified_at?: string;
  created_at?: string;
};

export type AppType = {
  id: string;
  project_id: string;
  name: string;
  type: "web" | "api" | "android" | "ios" | "unified";
  is_unified: number;
  created_at?: string;
};

export type Requirement = {
  id: string;
  display_id?: string | null;
  jira_url?: string | null;
  project_id: string;
  iteration_id?: string | null;
  title: string;
  description: string | null;
  gherkin_scenarios?: string[];
  external_references?: string[];
  detail_complete?: boolean;
  labels?: string[];
  sprint?: string | null;
  sprint_id?: string | null;
  sprint_state?: string | null;
  sprint_start_date?: string | null;
  sprint_end_date?: string | null;
  sprint_complete_date?: string | null;
  fix_version?: string | null;
  release?: string | null;
  priority: number | null;
  status: string | null;
  status_category?: string | null;
  test_case_ids?: string[];
  defect_ids?: string[];
  defects?: RequirementDefectLink[];
  related_items?: RequirementRelatedItem[];
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  revision?: number;
};

export type RequirementRelatedItem = {
  id: string;
  display_id?: string | null;
  title: string;
  issue_type: string;
  relation: string;
  direction: "inward" | "outward";
  status?: string | null;
  status_category?: string | null;
  priority?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  jira_url?: string | null;
  qaira_kind?: "test-case" | "test-suite" | "test-run" | "bug" | "requirement" | null;
};

export type RequirementIteration = {
  id: string;
  display_id?: string | null;
  project_id: string;
  name: string;
  description?: string | null;
  goal?: string | null;
  jira_sprint_id?: string | null;
  jira_sprint_name?: string | null;
  source?: "jira" | "qaira" | string;
  state?: string | null;
  status?: string | null;
  board_id?: string | null;
  board_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  complete_date?: string | null;
  requirement_count?: number;
  requirement_ids?: string[];
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RequirementDefectLink = {
  id: string;
  title: string;
  status: string | null;
  status_category?: string | null;
  severity?: string | null;
  priority?: string | null;
  link_source?: "manual" | "automatic" | string;
  created_at?: string;
};

export type TestCaseDefectLink = {
  id: string;
  title: string;
  status: string | null;
  severity?: string | null;
  priority?: string | null;
  link_source?: "manual" | "automatic" | string;
  created_at?: string;
};

export type TestCaseReviewStatus = "not_requested" | "pending" | "accepted" | "changes_requested";

export type TestCaseReviewEvent = {
  id: string;
  status: TestCaseReviewStatus;
  comment?: string | null;
  user_id?: string | null;
  created_at?: string;
};

export type Issue = {
  id: string;
  jira_url?: string | null;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  title: string;
  message: string;
  labels?: string[];
  sprint?: string | null;
  fix_version?: string | null;
  release?: string | null;
  steps_to_reproduce?: string | null;
  expected_result?: string | null;
  actual_result?: string | null;
  severity?: string | null;
  priority?: string | null;
  environment?: string | null;
  build?: string | null;
  jira_bug_key?: string | null;
  linked_test_run_id?: string | null;
  linked_test_case_ids?: string[];
  linked_test_suite_ids?: string[];
  linked_module_ids?: string[];
  linked_requirement_ids?: string[];
  traceability_truncated?: boolean;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  root_cause?: string | null;
  status: string | null;
  status_category?: string | null;
  revision?: number;
  created_at?: string;
  updated_at?: string;
};

export type AiBugDraftPreview = {
  draft: {
    title: string;
    message: string;
    steps_to_reproduce: string;
    expected_result: string;
    actual_result: string;
    severity: "critical" | "high" | "medium" | "low";
    priority: "Highest" | "High" | "Medium" | "Low" | "Lowest";
    environment: string;
    build: string;
    labels: string[];
    linked_test_run_id: string;
    linked_test_case_ids: string[];
    linked_requirement_ids: string[];
    rationale: string;
  };
  citations: Array<{ type: string; id: string; title?: string | null }>;
  provenance: AiAssistanceProvenance & { usage?: Record<string, number> | null };
};

export type AiBugTriageRecommendation = {
  issue_id: string;
  display_id: string;
  title: string;
  category: string;
  current_priority: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  recommended_priority: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  explanation: string;
  signals: string[];
  review_actions: string[];
};

export type AiBugTriagePreview = AiAssistedPreviewBase & {
  scope: {
    project_id: string;
    project_key: string;
    issue_count: number;
    maximum_issue_count: number;
  };
  summary: string;
  triage: AiBugTriageRecommendation[];
  review_sequence: string[];
  limitations: string[];
  preview_only: true;
  decision_requires_human_approval: true;
};

export type IntegrationType =
  | "llm"
  | "jira"
  | "email"
  | "google_auth"
  | "google_drive"
  | "github"
  | "testengine"
  | "cloudrun"
  | "ops"
  | "local-desktop";

export type Integration = {
  id: string;
  type: IntegrationType;
  name: string;
  base_url: string | null;
  api_key: string | null;
  model: string | null;
  project_key: string | null;
  username: string | null;
  config: Record<string, unknown> | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type DomainOption = {
  id?: string | null;
  value: string;
  label: string;
  description?: string;
  icon?: string;
  defaults?: Record<string, unknown>;
  category_key?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  current?: boolean;
  can_transition?: boolean;
  transition_id?: string | null;
};

export type DomainMetadata = {
  app_types: {
    default_type: string;
    types: DomainOption[];
  };
  integrations: {
    default_type: string;
    types: DomainOption[];
  };
  requirements: {
    default_status: string;
    statuses: DomainOption[];
    workflow_source?: string;
    priority_scale: number[];
  };
  test_cases: {
    default_status: string;
    default_automated: string;
    statuses: DomainOption[];
    automated_options: DomainOption[];
    priority_scale: number[];
  };
  test_steps: {
    group_kinds: DomainOption[];
    types?: DomainOption[];
  };
  test_data_sets: {
    default_mode: string;
    modes: DomainOption[];
  };
  test_environments: {
    browsers: DomainOption[];
    mobile_os: DomainOption[];
  };
  executions: {
    statuses: DomainOption[];
    final_statuses: DomainOption[];
    result_statuses: DomainOption[];
    impact_levels: DomainOption[];
  };
  issues: {
    default_status: string;
    statuses: DomainOption[];
    workflow_source?: string;
  };
  feedback?: {
    default_status: string;
    statuses: DomainOption[];
    workflow_source?: string;
  };
  access?: {
    default_permissions?: string[];
    pages?: Record<string, string[]>;
    permission_groups?: PermissionGroup[];
    route_permissions?: Array<{
      method: string;
      path: string;
      permission: string;
    }>;
  };
  feature_flags?: {
    groups?: FeatureFlagGroup[];
  };
  field_catalogs?: Record<string, {
    label: string;
    description?: string;
    sections?: string[];
    fields: Array<{
      key: string;
      jira_key: string;
      label: string;
      description?: string;
      type: "shortText" | "paragraph" | "number" | "select" | "multiSelect" | "user" | "labels" | "date" | "dateTime" | string;
      options?: DomainOption[];
      required?: boolean;
      system_managed?: boolean;
    }>;
  }>;
  jira?: {
    sprint_field_id: string | null;
    board_lookup_unavailable?: boolean;
    sprint_lookup_unavailable?: boolean;
    boards: Array<{ id: string; name: string; type?: string | null; location?: unknown }>;
    sprints: Array<{ id: string; name: string; state?: string | null; board_id?: string | null; board_name?: string | null; start_date?: string | null; end_date?: string | null; complete_date?: string | null; goal?: string | null }>;
    versions: Array<{ id: string; name: string; released: boolean; archived: boolean; release_date?: string | null }>;
  };
};

export type AiDesignImageInput = {
  name?: string | null;
  url: string;
};

export type AiAssistanceProvenance = {
  capability: string;
  generation_mode: "deterministic" | "llm" | string;
  provider: string;
  model: string | null;
  request_id: string;
  input_fingerprint: string;
  generated_at: string;
  confidence: number;
  evidence: string[];
  fallback_used: boolean;
  fallback_reason?: string | null;
  requires_human_review: boolean;
};

export type AiAssistedPreviewBase = {
  integration: {
    id: string;
    name: string;
    type: string;
    model?: string | null;
    generation_mode?: string;
    direct_model_invocation?: boolean;
  };
  provenance: AiAssistanceProvenance;
  generation_mode: string;
  generated_at: string;
  request_id: string;
  input_fingerprint: string;
  confidence: number;
  fallback_used: boolean;
  fallback_reason?: string | null;
  requires_human_review: boolean;
  preview_only: true;
};

export type AiImpactReference = {
  id: string;
  display_id?: string | null;
  title?: string | null;
  name?: string | null;
  status?: string | null;
  priority?: number | null;
  release?: string | null;
  build?: string | null;
  automation_status?: string | null;
  locator_intent?: string | null;
  locator_kind?: string | null;
  confidence?: number | null;
};

export type RequirementImpactPreviewResponse = AiAssistedPreviewBase & {
  requirement: {
    id: string;
    display_id: string;
    title: string;
    priority: number | null;
    risk_score: number;
  };
  impact: {
    risk_level: "low" | "medium" | "high";
    test_cases: AiImpactReference[];
    test_suites: AiImpactReference[];
    test_runs: AiImpactReference[];
    automation_assets: AiImpactReference[];
    totals: {
      test_cases: number;
      test_suites: number;
      test_runs: number;
      automation_assets: number;
    };
  };
  explanation: string;
  recommended_actions: string[];
};

export type TestCaseImpactPreviewResponse = AiAssistedPreviewBase & {
  test_case: {
    id: string;
    display_id: string;
    title: string;
    status: string | null;
    priority: number | null;
    automation_status: string | null;
    step_count: number;
  };
  impact: {
    risk_level: "low" | "medium" | "high";
    requirements: AiImpactReference[];
    test_suites: AiImpactReference[];
    test_runs: AiImpactReference[];
    automation_assets: AiImpactReference[];
    object_repository_items: AiImpactReference[];
    totals: {
      requirements: number;
      test_suites: number;
      test_runs: number;
      automation_assets: number;
      object_repository_items: number;
    };
  };
  risk_signals: string[];
  explanation: string;
  recommended_actions: string[];
};

export type ExecutionFailureClusterPreviewResponse = AiAssistedPreviewBase & {
  execution: {
    id: string;
    display_id: string;
    name: string | null;
    status: string | null;
    release?: string | null;
    build?: string | null;
  };
  total_results: number;
  failed_or_blocked_results: number;
  clusters: Array<{
    id: string;
    label: string;
    count: number;
    confidence: number;
    explanation: string;
    recommended_action: string;
    evidence_refs: string[];
    members: Array<{
      execution_result_id: string;
      test_case_id?: string | null;
      status: string;
      error_excerpt?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    }>;
  }>;
  unclassified_count: number;
  explanation: string;
  recommended_actions: string[];
};

export type QualityInsightPreviewResponse = AiAssistedPreviewBase & {
  project: {
    id: string;
    key: string;
    name?: string;
  };
  scope: { kind: "project"; project_key: string } | { kind: "release"; release: string };
  metrics: Record<string, number | string | null>;
  release_summary: string;
  insights: Array<{
    id: string;
    severity: "info" | "low" | "medium" | "high" | string;
    title: string;
    explanation: string;
    recommended_action: string;
    evidence: Array<AiImpactReference & { kind?: string }>;
  }>;
  generated_from: string[];
  limitations: string[];
};

export type QualityGateAssessmentPreviewResponse = AiAssistedPreviewBase & {
  quality_gate: {
    id: string;
    display_id: string;
    title: string;
    revision: number;
  };
  scope:
    | { kind: "test_plan"; id: string; display_id: string; title: string }
    | { kind: "release"; release: string }
    | { kind: "project"; project_key: string };
  assessment: "pass" | "fail";
  checks: Array<{
    key: string;
    label: string;
    actual: number;
    operator: ">=" | "<=";
    threshold: number;
    unit: string;
    passed: boolean;
    explanation: string;
  }>;
  failed_check_count: number;
  explanation: string;
  recommendations: string[];
  metrics_snapshot: Record<string, number | string | null>;
  decision_requires_human_approval: true;
  evaluated_at: string;
};

export type AiPromptTemplate = {
  id: string;
  project_id: string | null;
  app_type_id?: string | null;
  scope: string;
  name: string;
  description?: string | null;
  domain?: string | null;
  role?: string | null;
  test_type?: string | null;
  test_format?: string | null;
  test_count?: number | null;
  prompt_text: string;
  applies_to: string[];
  tags: string[];
  built_in?: boolean;
  is_active?: boolean;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AiDesignedTestCaseCandidate = {
  client_id: string;
  title: string;
  description: string | null;
  priority: number;
  applicable_domain?: string | null;
  requirement_ids: string[];
  requirement_titles: string[];
  steps: Array<{
    step_order: number;
    action: string | null;
    expected_result: string | null;
  }>;
  step_count: number;
};

export type AiDesignPreviewResponse = {
  generated: number;
  cases: AiDesignedTestCaseCandidate[];
  integration: {
    id: string;
    name: string;
    type: string;
    model?: string | null;
  };
  requirements: Array<{
    id: string;
    title: string;
  }>;
  app_type: {
    id: string;
    name: string;
  };
};

export type AiAuthoredTestCasePreview = {
  summary?: string | null;
  title: string;
  description: string | null;
  parameter_values: Record<string, string>;
  steps: Array<{
    step_order: number;
    step_type?: "web" | "api" | "android" | "ios" | null;
    action: string | null;
    expected_result: string | null;
  }>;
  step_count: number;
  parameter_count: number;
};

export type AiCaseAuthoringPreviewResponse = {
  integration: {
    id: string;
    name: string;
    type: string;
    model?: string | null;
  };
  requirement: {
    id: string;
    title: string;
  };
  app_type: {
    id: string;
    name: string;
  };
  case: AiAuthoredTestCasePreview;
};

export type AiStepRephraseResponse = {
  integration: {
    id: string;
    name: string;
    type: string;
    model?: string | null;
  };
  step: {
    step_order: number;
    step_type?: "web" | "api" | "android" | "ios" | null;
    action: string | null;
    expected_result: string | null;
  };
};

export type AiRequirementDescriptionRephraseResponse = {
  integration: {
    id: string;
    name: string;
    type: string;
    model?: string | null;
  };
  requirement: {
    id?: string | null;
    display_id?: string | null;
    title?: string | null;
  };
  description: string;
};

export type AiRichTextRephraseResponse = {
  content: string;
  integration: {
    id: string;
    name: string;
    type: string;
    model?: string | null;
  };
  provenance?: Record<string, unknown>;
};

export type AiTestCaseGenerationJob = {
  id: string;
  project_id: string;
  app_type_id: string;
  integration_id?: string | null;
  requirement_ids: string[];
  max_cases_per_requirement: number;
  parallel_requirement_limit: number;
  additional_context?: string | null;
  external_links: string[];
  images: AiDesignImageInput[];
  status: "queued" | "running" | "completed" | "failed" | string;
  total_requirements: number;
  processed_requirements: number;
  generated_preview_count?: number;
  generated_cases_count: number;
  error?: string | null;
  last_error?: string | null;
  candidate_cases?: AiDesignedTestCaseCandidate[];
  created_cases?: Array<{ id: string; title: string; step_count: number; requirement_ids: string[]; source_client_id?: string | null; created_at?: string }>;
  created_by: string;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string;
};

export type WorkspaceTransaction = {
  id: string;
  project_id: string | null;
  app_type_id: string | null;
  category: string;
  action: string;
  status: "queued" | "running" | "completed" | "failed" | string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  related_kind: string | null;
  related_id: string | null;
  created_by: string | null;
  created_user: User | null;
  event_count?: number;
  latest_event_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WorkspaceTransactionEvent = {
  id: string;
  transaction_id: string;
  level: "info" | "success" | "warning" | "error" | string;
  phase: string | null;
  message: string;
  details: Record<string, unknown>;
  created_at?: string;
};

export type WorkspaceTransactionArtifact = {
  id: string;
  transaction_id: string;
  file_name: string;
  mime_type: string;
  created_at?: string;
};

export type SmartExecutionImpactCase = {
  test_case_id: string;
  title: string;
  description: string | null;
  priority: number | null;
  status: string | null;
  suite_names: string[];
  module_names?: string[];
  requirement_titles: string[];
  step_count: number;
  reason: string;
  signals?: string[];
  risk_score?: number;
  impact_level: "critical" | "high" | "medium" | "low";
  failure_count?: number;
  blocked_count?: number;
  bug_count?: number;
  last_failure_at?: string | null;
  selection_basis?: string[];
  evidence?: {
    result_ids: string[];
    bug_ids: string[];
    requirement_ids: string[];
    run_ids: string[];
  };
};

export type SmartExecutionEvidenceSummary = {
  scoped_requirement_count: number;
  scoped_bug_count: number;
  scoped_run_count: number;
  failed_case_count: number;
  blocked_case_count: number;
  candidate_case_count: number;
  returned_case_count: number;
  scanned_case_count: number;
  scan_truncated: boolean;
};

export type SmartExecutionPreviewResponse = {
  integration: {
    id: string;
    name: string;
    type: string;
    model?: string | null;
  };
  app_type: {
    id: string;
    name: string;
  };
  default_suite: {
    id: string;
    name: string;
  };
  delivery_scope?: {
    release: string | null;
    sprint: string | null;
    build: string | null;
  };
  source_case_count: number;
  matched_case_count: number;
  evidence_summary?: SmartExecutionEvidenceSummary;
  query_strategy?: string[];
  retrieved_context_count?: number;
  execution_name: string;
  summary: string;
  cases: SmartExecutionImpactCase[];
  request_id?: string;
  generation_mode?: "llm" | "deterministic" | string;
};

export type TestSuite = {
  id: string;
  display_id?: string | null;
  app_type_id: string;
  name: string;
  parent_id: string | null;
  test_case_ids?: string[];
  labels?: string[];
  parameter_values?: Record<string, string>;
  parallel_enabled?: boolean | null;
  parallel_count?: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  revision?: number;
};

export type TestCase = {
  id: string;
  display_id?: string | null;
  app_type_id?: string | null;
  suite_id: string | null;
  suite_ids?: string[];
  requirement_ids?: string[];
  module_ids?: string[];
  defect_ids?: string[];
  title: string;
  description: string | null;
  external_references?: string[];
  labels?: string[];
  parameter_values?: Record<string, string>;
  automated: "yes" | "no" | null;
  automation_status?: "not_automated" | "ready" | "incomplete" | null;
  priority: number | null;
  status: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  requirement_id: string | null;
  reviewer_id?: string | null;
  review_status?: TestCaseReviewStatus | null;
  review_history?: TestCaseReviewEvent[];
  ai_quality_score?: number | null;
  ai_generation_source?: "scheduler" | null;
  ai_generation_review_status?: "pending" | "accepted" | null;
  ai_generation_job_id?: string | null;
  ai_generated_at?: string | null;
  step_count?: number;
  step_types?: TestStepType[];
  api_only?: boolean;
  detail_complete?: boolean;
  summary_complete?: boolean;
  external_reference_count?: number;
  external_references_truncated?: boolean;
  [key: string]: unknown;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  revision?: number;
};

export type JiraComment = {
  id: string;
  body: string;
  created: string | null;
  updated: string | null;
  author: {
    accountId?: string;
    displayName?: string;
    avatarUrls?: Record<string, string>;
  } | null;
};

export type TestCaseVersionSummary = {
  revision: number;
  captured_at: string | null;
  captured_by: string | null;
  reason: string;
  title: string;
  status: string | null;
  step_count: number;
};

export type TestCaseVersionContent = {
  app_type_id?: string | null;
  suite_id?: string | null;
  suite_ids?: string[];
  requirement_id?: string | null;
  requirement_ids?: string[];
  title: string;
  description?: string | null;
  external_references?: string[];
  labels?: string[];
  parameter_values?: Record<string, string>;
  automated?: "yes" | "no" | null;
  automation_status?: "not_automated" | "ready" | "incomplete" | null;
  priority?: number | null;
  status?: string | null;
  reviewer_id?: string | null;
  ai_quality_score?: number | null;
  steps?: TestStep[];
};

export type TestCaseVersionSnapshot = {
  schema: "qaira.testCaseVersion.v1";
  revision: number;
  captured_at: string;
  captured_by: string | null;
  reason: string;
  content: TestCaseVersionContent;
};

export type TestCaseModule = {
  id: string;
  display_id?: string | null;
  app_type_id: string;
  name: string;
  description?: string | null;
  test_case_count?: number;
  test_case_ids?: string[];
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TestStep = {
  id: string;
  test_case_id: string;
  step_order: number;
  action: string | null;
  expected_result: string | null;
  step_type?: TestStepType | null;
  automation_code?: string | null;
  api_request?: StepApiRequest | null;
  group_id?: string | null;
  group_name?: string | null;
  group_kind?: "local" | "reusable" | null;
  reusable_group_id?: string | null;
};

export type AutomationLearningCacheEntry = {
  id: string;
  project_id?: string | null;
  app_type_id?: string | null;
  test_case_id?: string | null;
  page_url?: string | null;
  page_key: string;
  locator_intent: string;
  locator: string;
  locator_kind?: string | null;
  confidence: number;
  source: string;
  metadata?: Record<string, unknown>;
  hit_count: number;
  created_at?: string;
  updated_at?: string;
};

export type ObjectRepositoryImportEntry = {
  screen_name: string;
  record_type: "screen" | "field";
  page_url?: string;
  page_key?: string;
  locator_intent?: string;
  locator?: string;
  locator_kind?: string;
  confidence?: number;
  source?: string;
  object_name?: string;
  object_role?: string;
  metadata?: Record<string, unknown>;
};

export type ObjectRepositoryImportResult = {
  created: number;
  updated: number;
  failed: number;
  transaction_id?: string;
  errors: Array<{
    index: number;
    screen_name?: string | null;
    object_name?: string | null;
    message: string;
  }>;
};

export type ObjectRepositoryContext = {
  repositoryType: "ui_intelligence_repository";
  generatedAt: string;
  screens: Array<{
    screen: string;
    appType: string | null;
    urlPattern: { type: string; value: string | null };
    fingerprint: string | null;
    fields: Array<{
      name: string;
      type: string;
      primaryLocator: string;
      primaryStrategy: string | null;
      confidenceScore: number;
      fallbackLocators: unknown[];
      description: string | null;
      businessMeaning: string | null;
      usageKeywords: unknown[];
      stabilityScore: number;
      lastValidatedDate: string | null;
    }>;
  }>;
};

export type AutomationBuildResponse = {
  test_case_id: string;
  title: string;
  automated: "yes" | "no";
  automation_status?: "not_automated" | "ready" | "incomplete";
  generated_step_count: number;
  created_step_count?: number;
  updated_step_count?: number;
  learned_locator_count: number;
  cache_hits: number;
  fallback_used: boolean;
  fallback_reason?: string | null;
  summary: string;
  transaction_id?: string;
  artifact_id?: string | null;
  api_test_case?: {
    id: string;
    title: string;
    step_count: number;
  } | null;
};

export type RecorderSessionResponse = {
  id: string;
  purpose?: "automation-recording" | "repository-inspect" | null;
  status: "running" | "stopped" | "failed";
  reused?: boolean;
  started_at?: string;
  stopped_at?: string | null;
  last_activity_at?: string | null;
  start_url?: string | null;
  display_mode?: "browser-live-view" | "local-browser-with-live-view" | string | null;
  live_view_path?: string | null;
  action_count?: number;
  network_count?: number;
  actions?: Array<{
    index: number;
    type: string;
    locator?: string | null;
    text?: string | null;
    value?: string | null;
    url?: string | null;
    page_id?: string | null;
    page_title?: string | null;
    source?: string | null;
    timestamp?: string | null;
  }>;
  network?: Array<{
    index: number;
    method: string;
    url: string;
    status?: number | null;
    resource_type?: string | null;
    content_type?: string | null;
    page_id?: string | null;
    page_title?: string | null;
    timestamp?: string | null;
  }>;
  transaction_id?: string;
  engine_base_url?: string;
  status_url?: string;
  live_view_url?: string | null;
  capture?: {
    actions?: boolean;
    network?: boolean;
    duplicate_typing_suppression?: boolean;
    injection?: string;
    extension_ready?: boolean;
    remote_control?: boolean;
    screenshot_stream?: boolean;
    screencast_stream?: boolean;
  };
};

export type TestStepType = "web" | "api" | "android" | "ios";

export type StepApiRequestHeader = {
  key: string;
  value: string;
};

export type StepApiValidationKind = "status" | "header" | "header_present" | "body_contains" | "body_not_contains" | "json_path" | "json_schema" | "response_time";
export type StepApiValidationOperator = "eq" | "ne" | "contains" | "matches" | "exists" | "lt" | "lte" | "gt" | "gte";

export type StepApiValidation = {
  kind: StepApiValidationKind;
  operator?: StepApiValidationOperator;
  target?: string | null;
  expected?: string | null;
};

export type StepApiResponseCapture = {
  path?: string | null;
  parameter?: string | null;
};

export type StepApiRequest = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  url?: string | null;
  headers?: StepApiRequestHeader[];
  query_params?: StepApiRequestHeader[];
  cookies?: StepApiRequestHeader[];
  auth?: {
    type: "none" | "bearer" | "api_key" | "basic" | "oauth2_ref";
    credential_reference?: string | null;
    key_name?: string | null;
    location?: "header" | "query";
  };
  timeout_ms?: number;
  follow_redirects?: boolean;
  body_mode?: "none" | "json" | "text" | "xml" | "form";
  body?: string | null;
  validations?: StepApiValidation[];
  captures?: StepApiResponseCapture[];
};

export type ApiRequestPreview = {
  request: {
    method: NonNullable<StepApiRequest["method"]>;
    url: string;
  };
  response: {
    status: number;
    ok: boolean;
    headers: Record<string, string>;
    content_type?: string | null;
    body_text: string;
    body_json?: unknown;
    duration_ms: number;
  };
  ai_suggestions?: {
    summary: string;
    assertions: StepApiValidation[];
    captures: StepApiResponseCapture[];
    notes?: string[];
  };
};

export type SharedStepGroupStep = {
  step_order: number;
  action: string | null;
  expected_result: string | null;
  step_type?: TestStepType | null;
  automation_code?: string | null;
  api_request?: StepApiRequest | null;
};

export type SharedStepGroup = {
  id: string;
  display_id?: string;
  app_type_id: string;
  name: string;
  description: string | null;
  steps: SharedStepGroupStep[];
  parameter_values?: Record<string, string>;
  step_count?: number;
  usage_count?: number;
  used_test_cases?: Array<{
    id: string;
    title: string;
    status: string | null;
    referenced_step_count: number;
  }>;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type KeyValueEntry = {
  id?: string;
  key: string;
  value: string;
  is_secret?: boolean;
  has_stored_value?: boolean;
};

export type TestEnvironment = {
  id: string;
  project_id: string;
  app_type_id: string | null;
  name: string;
  description: string | null;
  base_url: string | null;
  browser: string | null;
  notes: string | null;
  variables: KeyValueEntry[];
  created_at?: string;
};

export type TestConfiguration = {
  id: string;
  project_id: string;
  app_type_id: string | null;
  name: string;
  description: string | null;
  browser: string | null;
  mobile_os: string | null;
  platform_version: string | null;
  variables: KeyValueEntry[];
  created_at?: string;
};

export type TestDataSetMode = "key_value" | "table";

export type TestDataSetRow = Record<string, string>;

export type AiTestDataGenerationPreviewResponse = {
  prompt: string;
  field_context: string | null;
  summary: string;
  suggestions: Array<{ id: string; value: string }>;
  randomized_template: string;
  randomization_strategy: "reviewed-value-pool";
  runtime_llm_invocation: false;
  generation_mode: "llm" | "deterministic";
  fallback_used: boolean;
  fallback_reason?: string | null;
  generated_at: string;
  requires_human_review: boolean;
};

export type TestDataSet = {
  id: string;
  project_id: string;
  app_type_id: string | null;
  name: string;
  description: string | null;
  mode: TestDataSetMode;
  columns: string[];
  rows: TestDataSetRow[];
  template_rows?: TestDataSetRow[];
  created_at?: string;
};

export type ExecutionEnvironmentSnapshot = {
  id: string;
  name: string;
  description: string | null;
  base_url: string | null;
  browser: string | null;
  notes: string | null;
  variables: KeyValueEntry[];
};

export type ExecutionConfigurationSnapshot = {
  id: string;
  name: string;
  description: string | null;
  browser: string | null;
  mobile_os: string | null;
  platform_version: string | null;
  variables: KeyValueEntry[];
};

export type ExecutionDataSetSnapshot = {
  id: string;
  name: string;
  description: string | null;
  mode: TestDataSetMode;
  columns: string[];
  rows: TestDataSetRow[];
  template_rows?: TestDataSetRow[];
  generated_at?: string;
  generated_field_count?: number;
};

export type ExecutionStatus = "queued" | "running" | "completed" | "failed" | "aborted";

export type ExecutionScopeUser = {
  id: string;
  email: string;
  name: string | null;
  avatar_data_url?: string | null;
};

export type ExecutionScopeSnapshot = {
  id: string;
  display_id?: string | null;
  name: string;
  parameter_values?: Record<string, string>;
  revision?: number;
  suite_ids?: string[];
  test_case_count?: number;
  assigned_to?: string | null;
  assigned_to_ids?: string[];
  assigned_user?: ExecutionScopeUser | null;
  assigned_users?: ExecutionScopeUser[];
};

export type Execution = {
  id: string;
  display_id?: string | null;
  project_id: string;
  app_type_id: string | null;
  test_case_ids: string[];
  suite_ids: string[];
  suite_snapshots?: ExecutionScopeSnapshot[];
  module_snapshots?: ExecutionScopeSnapshot[];
  case_snapshots?: ExecutionCaseSnapshot[];
  step_snapshots?: ExecutionStepSnapshot[];
  requirement_snapshots?: Array<{ id: string; display_id?: string | null; title: string; priority?: number | null; status?: string | null }>;
  scope_case_count?: number;
  scope_step_count?: number;
  scope_requirement_count?: number;
  requirement_snapshots_truncated?: boolean;
  direct_test_case_ids?: string[];
  scope_source?: string | null;
  scope_fingerprint?: string | null;
  name: string | null;
  trigger: "manual" | "ci" | "local" | null;
  status: ExecutionStatus | null;
  test_environment?: {
    id: string | null;
    name: string;
    snapshot: ExecutionEnvironmentSnapshot | null;
  } | null;
  test_configuration?: {
    id: string | null;
    name: string;
    snapshot: ExecutionConfigurationSnapshot | null;
  } | null;
  test_data_set?: {
    id: string | null;
    name: string;
    snapshot: ExecutionDataSetSnapshot | null;
  } | null;
  release?: string | null;
  sprint?: string | null;
  build?: string | null;
  assigned_to?: string | null;
  assigned_to_ids?: string[];
  parallel_enabled?: boolean | null;
  parallel_count?: number | null;
  assigned_user?: {
    id: string;
    email: string;
    name: string | null;
    avatar_data_url?: string | null;
  } | null;
  assigned_users?: Array<{
    id: string;
    email: string;
    name: string | null;
    avatar_data_url?: string | null;
  }>;
  suite_assignments?: Record<string, string[]>;
  module_assignments?: Record<string, string[]>;
  case_assignments?: Record<string, string[]>;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
  started_at: string | null;
  ended_at: string | null;
};

export type ExecutionSchedule = {
  id: string;
  project_id: string;
  app_type_id: string | null;
  name: string;
  cadence: "once" | "daily" | "weekly" | "monthly" | string;
  next_run_at: string | null;
  last_run_at?: string | null;
  suite_ids: string[];
  test_case_ids: string[];
  test_environment_id?: string | null;
  test_configuration_id?: string | null;
  test_data_set_id?: string | null;
  release?: string | null;
  sprint?: string | null;
  build?: string | null;
  assigned_to?: string | null;
  assigned_to_ids?: string[];
  assigned_users?: Array<{
    id: string;
    email: string;
    name: string | null;
    avatar_data_url?: string | null;
  }>;
  assigned_user?: {
    id: string;
    email: string;
    name: string | null;
    avatar_data_url?: string | null;
  } | null;
  created_by: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type AgenticWorkflowStatus = "draft" | "active" | "paused" | "archived";

export type AgenticWorkflowTriggerKind = "manual" | "webhook" | "schedule" | "release" | "event";

export type AgenticWorkflowNodeData = {
  label?: string;
  name?: string;
  kind?: "trigger" | "agent" | "tool" | "condition" | "transform" | "output" | string;
  summary?: string;
  prompt?: string;
  inputKey?: string;
  outputKey?: string;
  sampleOutput?: string;
  model?: string;
  tool?: string;
  [key: string]: unknown;
};

export type AgenticWorkflowNode = {
  id: string;
  type?: string;
  position: {
    x: number;
    y: number;
  };
  data: AgenticWorkflowNodeData;
};

export type AgenticWorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
  type?: string;
  label?: string;
  [key: string]: unknown;
};

export type AgenticWorkflow = {
  id: string;
  project_id: string;
  app_type_id: string | null;
  name: string;
  description: string | null;
  status: AgenticWorkflowStatus;
  trigger_kind: AgenticWorkflowTriggerKind;
  nodes: AgenticWorkflowNode[];
  edges: AgenticWorkflowEdge[];
  settings: Record<string, unknown>;
  n8n_payload: Record<string, unknown>;
  run_count?: number;
  latest_run_at?: string | null;
  latest_run_status?: AgenticWorkflowRun["status"] | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AgenticWorkflowRun = {
  id: string;
  workflow_id: string | null;
  project_id: string;
  app_type_id: string | null;
  workflow_name: string;
  status: ExecutionStatus;
  trigger_kind: AgenticWorkflowTriggerKind;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  workflow_snapshot: Record<string, unknown>;
  node_results: Array<Record<string, unknown>>;
  created_by?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExecutionCaseSnapshot = {
  execution_id: string;
  test_case_id: string;
  test_case_title: string;
  test_case_description: string | null;
  external_references?: string[];
  requirement_ids?: string[];
  defect_ids?: string[];
  suite_id: string | null;
  suite_name: string | null;
  module_id?: string | null;
  module_name?: string | null;
  priority: number | null;
  status: string | null;
  parameter_values?: Record<string, string>;
  parameter_template_values?: Record<string, string>;
  suite_parameter_values?: Record<string, string>;
  suite_parameter_template_values?: Record<string, string>;
  sort_order: number;
  assigned_to?: string | null;
  assigned_to_ids?: string[];
  assignment_source?: "run" | "suite" | "module" | "case" | null;
  assigned_user?: {
    id: string;
    email: string;
    name: string | null;
    avatar_data_url?: string | null;
  } | null;
  assigned_users?: ExecutionScopeUser[];
};

export type ExecutionStepSnapshot = {
  execution_id: string;
  test_case_id: string;
  snapshot_step_id: string;
  step_order: number;
  action: string | null;
  expected_result: string | null;
  step_type?: TestStepType | null;
  automation_code?: string | null;
  api_request?: StepApiRequest | null;
  group_id?: string | null;
  group_name?: string | null;
  group_kind?: "local" | "reusable" | null;
  reusable_group_id?: string | null;
};

export type ExecutionResult = {
  id: string;
  execution_id: string;
  test_case_id: string;
  test_case_title?: string | null;
  suite_id?: string | null;
  suite_name?: string | null;
  app_type_id: string;
  status: "running" | "passed" | "failed" | "blocked";
  duration_ms: number | null;
  error: string | null;
  logs: string | null;
  external_references?: string[];
  defects?: string[];
  executed_by: string | null;
  created_at?: string;
};

export type TraceabilityRunHistoryItem = {
  id: string;
  execution_id: string;
  execution_display_id?: string | null;
  execution_name: string;
  execution_status: ExecutionStatus | null;
  trigger: Execution["trigger"];
  suite_ids: string[];
  test_case_id: string;
  test_case_title: string;
  result_status: ExecutionResult["status"];
  defects: string[];
  result_created_at?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  release?: string | null;
  sprint?: string | null;
  build?: string | null;
};

export type SessionPayload = {
  token: string;
  user: User;
};

export type AuthSetupPayload = {
  google: {
    enabled: boolean;
    clientId: string | null;
  };
  emailVerification: {
    enabled: boolean;
    senderEmail: string | null;
    senderName: string | null;
  };
};

export type ApiError = {
  statusCode?: number;
  error?: string;
  message?: string;
};
