import type { SessionPayload } from "../types";

const ADMIN_ROLE = "admin";
export type PageAccessMap = Record<string, string[]>;

// A session normally includes the backend-computed permission list. Older or
// incomplete payloads fail closed to workspace access instead of recreating a
// second, drift-prone role catalog in the browser.
const MEMBER_DEFAULT_PERMISSIONS = new Set(["workspace.view"]);

const PATH_PERMISSIONS: PageAccessMap = {
  "/": ["dashboard.view"],
  "/projects": ["project.view"],
  "/admin-space": ["user.view", "role.view", "integration.view", "settings.manage"],
  "/people": ["user.view", "role.view"],
  "/integrations": ["integration.view"],
  "/requirements": ["requirement.view"],
  "/test-cases": ["testcase.view"],
  "/shared-steps": ["shared_step.view"],
  "/design": ["suite.view"],
  "/test-plans": ["plan.view"],
  "/quality-gates": ["quality_gate.view"],
  "/automation": ["automation.view"],
  "/automation-assets": ["automation.view"],
  "/object-repository": ["automation.view"],
  "/agentic-workflows": ["agentic_workflow.view"],
  "/executions": ["run.view"],
  "/testops": ["transaction.view", "ops.view"],
  "/ops-telemetry": ["ops.view"],
  "/traces": ["ops.view"],
  "/test-environments": ["environment.view"],
  "/test-configurations": ["configuration.view"],
  "/test-data": ["data.view"],
  "/knowledge-repo": ["knowledge.view"],
  "/ai/quality-insights": ["quality_insight.view"],
  "/issues": ["feedback.view"],
  "/feedback": ["feedback.view"],
  "/settings": ["settings.view", "workspace.view"],
  "/support": ["workspace.view"],
  "/notifications": ["notification.view"]
};

export function hasPermission(session: SessionPayload | null, permission: string) {
  if (!session?.user) {
    return false;
  }

  if (session.user.role === ADMIN_ROLE || session.user.role_id === "jira-admin") {
    return true;
  }

  if (Array.isArray(session.user.permissions)) {
    return session.user.permissions.includes(permission);
  }

  return MEMBER_DEFAULT_PERMISSIONS.has(permission);
}

export function hasAnyPermission(session: SessionPayload | null, permissions: readonly string[]) {
  return permissions.some((permission) => hasPermission(session, permission));
}

export function requiredPermissionsForPath(pathname: string, pageAccess?: PageAccessMap | null) {
  return pageAccess?.[pathname] || PATH_PERMISSIONS[pathname] || ["workspace.view"];
}

export function canAccessPath(session: SessionPayload | null, pathname: string, pageAccess?: PageAccessMap | null) {
  return hasAnyPermission(session, requiredPermissionsForPath(pathname, pageAccess));
}
