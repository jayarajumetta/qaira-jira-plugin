type RoutePreloader = () => Promise<unknown>;

const routePreloaders: Record<string, RoutePreloader> = {
  "/": () => import("../pages/OverviewPage"),
  "/admin-space": () => import("../pages/AdminSpacePage"),
  "/agentic-workflows": () => import("../pages/AgenticWorkflowsPage"),
  "/automation": () => import("../pages/AutomationPage"),
  "/object-repository": () => import("../pages/AutomationPage"),
  "/design": () => import("../pages/DesignPage"),
  "/executions": () => import("../pages/ExecutionsPage"),
  "/integrations": () => import("../pages/IntegrationsPage"),
  "/issues": () => import("../pages/IssuesPage"),
  "/feedback": () => import("../pages/IssuesPage"),
  "/knowledge-repo": () => import("../pages/KnowledgeRepoPage"),
  "/notifications": () => import("../pages/NotificationsPage"),
  "/people": () => import("../pages/PeoplePage"),
  "/projects": () => import("../pages/ProjectsPage"),
  "/requirements": () => import("../pages/RequirementsPage"),
  "/settings": () => import("../pages/SettingsPage"),
  "/shared-steps": () => import("../pages/SharedStepsPage"),
  "/support": () => import("../pages/SupportPage"),
  "/test-cases": () => import("../pages/TestCasesPage"),
  "/test-environments": () => import("../pages/TestEnvironmentPage"),
  "/test-data": () => import("../pages/TestEnvironmentPage"),
  "/test-configurations": () => import("../pages/TestEnvironmentPage"),
  "/testops": () => import("../pages/TestOpsPage"),
  "/ops-telemetry": () => import("../pages/TestOpsPage"),
  "/traces": () => import("../pages/TestOpsPage")
};

const preloadedRoutes = new Set<string>();

const normalizeRoutePath = (to: string) => {
  const path = to.split("?")[0]?.trim() || "/";
  return path.startsWith("/") ? path : `/${path}`;
};

const scheduleIdle = (work: () => void) => {
  const runtime = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  };

  if (typeof runtime.requestIdleCallback === "function") {
    runtime.requestIdleCallback(work, { timeout: 1_200 });
    return;
  }

  globalThis.setTimeout(work, 80);
};

export const preloadWorkspaceRoute = (to: string) => {
  if (!to) {
    return;
  }

  const path = normalizeRoutePath(to);
  const preloader = routePreloaders[path];

  if (!preloader || preloadedRoutes.has(path)) {
    return;
  }

  preloadedRoutes.add(path);
  scheduleIdle(() => {
    void preloader().catch(() => {
      preloadedRoutes.delete(path);
    });
  });
};
