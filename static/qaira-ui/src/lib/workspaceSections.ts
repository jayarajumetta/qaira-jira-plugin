export type WorkspaceSectionItem = {
  to: string;
  label: string;
  shortLabel?: string;
  featureKeys?: string[];
  icon?:
    | "analytics"
    | "dashboard"
    | "requirements"
    | "cases"
    | "shared"
    | "suites"
    | "executions"
    | "automation"
    | "repository"
    | "playwright"
    | "ops"
    | "telemetry"
    | "traces"
    | "environments"
    | "data"
    | "configurations";
};

export const DASHBOARD_SECTION_ITEMS: WorkspaceSectionItem[] = [
  { to: "/?view=analytics", label: "Quality analytics", shortLabel: "Analytics", icon: "analytics" },
  { to: "/?view=custom", label: "Custom dashboards", shortLabel: "Custom", icon: "dashboard" }
];

export const TEST_AUTHORING_SECTION_ITEMS: WorkspaceSectionItem[] = [
  { to: "/requirements", label: "Requirements", shortLabel: "Reqs", icon: "requirements", featureKeys: ["qaira.manual.requirements"] },
  { to: "/test-cases", label: "Cases", shortLabel: "Cases", icon: "cases", featureKeys: ["qaira.manual.test_cases"] },
  { to: "/shared-steps", label: "Shared Steps", shortLabel: "Shared", icon: "shared", featureKeys: ["qaira.manual.suites"] },
  { to: "/design", label: "Suites", shortLabel: "Suites", icon: "suites", featureKeys: ["qaira.manual.suites"] }
];

export const TEST_ENVIRONMENT_SECTION_ITEMS: WorkspaceSectionItem[] = [
  { to: "/test-environments", label: "Environments", shortLabel: "Env", icon: "environments", featureKeys: ["qaira.mobile.appium"] },
  { to: "/test-data", label: "Test Data", shortLabel: "Data", icon: "data", featureKeys: ["qaira.manual.test_cases"] },
  { to: "/test-configurations", label: "Configurations", shortLabel: "Config", icon: "configurations", featureKeys: ["qaira.mobile.appium"] }
];

export const AUTOMATION_SECTION_ITEMS: WorkspaceSectionItem[] = [
  { to: "/automation", label: "Automation", shortLabel: "Auto", icon: "automation", featureKeys: ["qaira.automation.workspace"] },
  { to: "/object-repository", label: "Objects", shortLabel: "Objects", icon: "repository", featureKeys: ["qaira.automation.workspace", "qaira.automation.object_repository"] }
];

export const TESTOPS_SECTION_ITEMS: WorkspaceSectionItem[] = [
  { to: "/testops", label: "Jobs", shortLabel: "Jobs", icon: "ops", featureKeys: ["qaira.automation.batch_process"] },
  { to: "/ops-telemetry", label: "Telemetry", shortLabel: "Telemetry", icon: "telemetry", featureKeys: ["qaira.ops.telemetry"] },
  { to: "/traces", label: "Traces", shortLabel: "Traces", icon: "traces", featureKeys: ["qaira.ops.telemetry"] }
];

export const AGENTIC_WORKFLOW_SECTION_ITEMS: WorkspaceSectionItem[] = [
  { to: "/agentic-workflows?view=workflows", label: "Workflows", shortLabel: "Flows", icon: "traces", featureKeys: ["qaira.ai.agentic_workflows"] },
  { to: "/agentic-workflows?view=runs", label: "Workflow Runs", shortLabel: "Runs", icon: "executions", featureKeys: ["qaira.ai.agentic_workflows"] }
];

export const TEST_RUNS_SECTION_ITEMS: WorkspaceSectionItem[] = [
  { to: "/executions?view=test-case-runs", label: "Test Case Runs", shortLabel: "Cases", icon: "cases", featureKeys: ["qaira.manual.runs"] },
  { to: "/executions?view=suite-runs", label: "Suite Runs", shortLabel: "Suites", icon: "suites", featureKeys: ["qaira.manual.runs"] },
  { to: "/executions?view=local-runs", label: "Local Runs", shortLabel: "Local", icon: "playwright", featureKeys: ["qaira.manual.runs", "qaira.automation.workspace", "qaira.automation.local_execution"] },
  { to: "/executions?view=scheduled-runs", label: "Scheduled Runs", shortLabel: "Scheduled", icon: "executions", featureKeys: ["qaira.manual.runs"] }
];

export const WORKSPACE_PAGE_LABELS: Record<string, string> = {
  "/": "Home",
  "/projects": "Projects",
  "/requirements": "Requirements",
  "/test-cases": "Cases",
  "/shared-steps": "Shared Step Groups",
  "/design": "Suites",
  "/executions": "Runs",
  "/automation": "Automation",
  "/object-repository": "Objects",
  "/testops": "Jobs",
  "/ops-telemetry": "Telemetry",
  "/traces": "Traces",
  "/test-environments": "Environments",
  "/test-data": "Test Data",
  "/test-configurations": "Configurations",
  "/admin-space": "Admin Space",
  "/people": "People",
  "/integrations": "Integrations",
  "/support": "Support",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/issues": "Bugs",
  "/feedback": "Bugs"
};

export const WORKSPACE_SECTION_LABEL_KEYS: Record<string, string> = {
  "/?view=analytics": "workspace.qualityAnalytics",
  "/?view=custom": "workspace.customDashboards",
  "/requirements": "workspace.requirements",
  "/test-cases": "workspace.testCases",
  "/shared-steps": "workspace.sharedSteps",
  "/design": "workspace.testSuites",
  "/executions": "workspace.executions",
  "/automation": "workspace.automationCases",
  "/object-repository": "workspace.objectRepository",
  "/testops": "workspace.batchProcess",
  "/ops-telemetry": "workspace.opsTelemetry",
  "/traces": "workspace.traces",
  "/test-environments": "workspace.environments",
  "/test-data": "workspace.testData",
  "/test-configurations": "workspace.configurations"
};

export const WORKSPACE_LIBRARY_PATHS = new Set([
  ...TEST_AUTHORING_SECTION_ITEMS.map((item) => item.to),
  "/executions",
  ...AUTOMATION_SECTION_ITEMS.map((item) => item.to),
  ...TESTOPS_SECTION_ITEMS.map((item) => item.to),
  ...TEST_ENVIRONMENT_SECTION_ITEMS.map((item) => item.to)
]);
