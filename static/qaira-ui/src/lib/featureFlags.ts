import type { FeatureFlagSnapshot } from "../types";

const PATH_FEATURE_FLAGS: Record<string, string[]> = {
  "/requirements": ["qaira.manual.requirements"],
  "/test-cases": ["qaira.manual.test_cases"],
  "/shared-steps": ["qaira.manual.suites"],
  "/design": ["qaira.manual.suites"],
  "/automation": ["qaira.automation.workspace"],
  "/object-repository": ["qaira.automation.workspace", "qaira.automation.object_repository"],
  "/agentic-workflows": ["qaira.ai.agentic_workflows"],
  "/executions": ["qaira.manual.runs"],
  "/testops": ["qaira.automation.batch_process"],
  "/ops-telemetry": ["qaira.ops.telemetry"],
  "/traces": ["qaira.ops.telemetry"],
  "/knowledge-repo": ["qaira.ai.knowledge"],
  "/settings": [],
  "/admin-space": [],
  "/people": ["qaira.ops.admin"],
  "/integrations": ["qaira.api.integrations"],
  "/notifications": ["qaira.ops.notifications"],
  "/test-environments": ["qaira.mobile.appium"],
  "/test-configurations": ["qaira.mobile.appium"],
  "/test-data": ["qaira.manual.test_cases"]
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
