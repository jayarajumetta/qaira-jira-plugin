import type { FeatureFlagSnapshot } from "../types";

const PATH_FEATURE_FLAGS: Record<string, string[]> = {
  "/": ["qaira.analytics.dashboards"],
  "/projects": ["qaira.ops.projects"],
  "/requirements": ["qaira.manual.requirements"],
  "/test-cases": ["qaira.manual.test_cases"],
  "/shared-steps": ["qaira.manual.suites"],
  "/design": ["qaira.manual.suites"],
  "/test-plans": ["qaira.manual.plans"],
  "/quality-gates": ["qaira.manual.quality_gates"],
  "/automation": ["qaira.automation.workspace"],
  "/automation-assets": ["qaira.automation.workspace", "qaira.automation.assets"],
  "/object-repository": ["qaira.automation.workspace", "qaira.automation.object_repository"],
  "/agentic-workflows": ["qaira.ai.agentic_workflows"],
  "/executions": ["qaira.manual.runs"],
  "/testops": ["qaira.automation.batch_process"],
  "/ops-telemetry": ["qaira.ops.telemetry"],
  "/traces": ["qaira.ops.telemetry"],
  "/knowledge-repo": ["qaira.ai.knowledge"],
  "/issues": ["qaira.manual.bugs"],
  "/feedback": ["qaira.manual.bugs"],
  "/settings": ["qaira.ops.settings"],
  "/admin-space": [],
  "/people": ["qaira.ops.admin"],
  "/integrations": ["qaira.api.integrations"],
  "/notifications": ["qaira.ops.notifications"],
  "/test-environments": ["qaira.manual.environments"],
  "/test-configurations": ["qaira.manual.environments"],
  "/test-data": ["qaira.manual.test_data"],
  "/ai/quality-insights": ["qaira.ai.quality_insights"]
};

export function requiredFeatureFlagsForPath(pathname: string) {
  return PATH_FEATURE_FLAGS[pathname] || [];
}

export function areFeatureFlagsEnabled(snapshot: FeatureFlagSnapshot | null | undefined, keys: readonly string[]) {
  if (!keys.length) {
    return true;
  }

  // Protected capabilities fail closed while the snapshot is loading or
  // unavailable. This prevents a disabled control from flashing into view.
  if (!snapshot) {
    return false;
  }

  return keys.every((key) => snapshot.flags[key] === true);
}
