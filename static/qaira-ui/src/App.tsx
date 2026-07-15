import {
  Navigate,
  RouterProvider,
  createHashRouter,
  useLocation,
  useNavigate
} from "react-router-dom";
import { Suspense, lazy, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, hashKey } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppErrorBoundary, AppErrorState } from "./components/AppErrorBoundary";
import { AppShell } from "./components/AppShell";
import { LoadingState } from "./components/LoadingState";
import { LocalizationProvider, useLocalization } from "./context/LocalizationContext";
import {
  getRouteFromLocation,
  isBrowserReload,
  readCurrentWorkspaceRoute,
  readPostAuthRoute,
  rememberAuthRedirectRoute,
  rememberCurrentWorkspaceRoute
} from "./lib/routeHistory";
import { projectAwareQueryKey } from "./lib/currentScope";
import { readWorkspaceTheme, writeWorkspaceTheme } from "./lib/workspacePreferences";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 10 * 60 * 1000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      queryKeyHashFn: (queryKey) => hashKey(projectAwareQueryKey(queryKey)),
      retry: (failureCount, error) => {
        const status = error && typeof error === "object"
          ? Number((error as { status?: number; statusCode?: number }).status || (error as { statusCode?: number }).statusCode || 0)
          : 0;
        return failureCount < 2 && (status === 0 || status >= 500 || status === 429);
      },
      staleTime: 30 * 1000
    },
    mutations: {
      retry: false
    }
  }
});

const AdminSpacePage = lazy(() => import("./pages/AdminSpacePage").then((module) => ({ default: module.AdminSpacePage })));
const AgenticWorkflowsPage = lazy(() => import("./pages/AgenticWorkflowsPage").then((module) => ({ default: module.AgenticWorkflowsPage })));
const AutomationPage = lazy(() => import("./pages/AutomationPage").then((module) => ({ default: module.AutomationPage })));
const DesignPage = lazy(() => import("./pages/DesignPage").then((module) => ({ default: module.DesignPage })));
const ExecutionsPage = lazy(() => import("./pages/ExecutionsPage").then((module) => ({ default: module.ExecutionsPage })));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage").then((module) => ({ default: module.IntegrationsPage })));
const IssuesPage = lazy(() => import("./pages/IssuesPage").then((module) => ({ default: module.IssuesPage })));
const KnowledgeRepoPage = lazy(() => import("./pages/KnowledgeRepoPage").then((module) => ({ default: module.KnowledgeRepoPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const OverviewPage = lazy(() => import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const PeoplePage = lazy(() => import("./pages/PeoplePage").then((module) => ({ default: module.PeoplePage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));
const RequirementsPage = lazy(() => import("./pages/RequirementsPage").then((module) => ({ default: module.RequirementsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const SharedStepsPage = lazy(() => import("./pages/SharedStepsPage").then((module) => ({ default: module.SharedStepsPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then((module) => ({ default: module.SupportPage })));
const TestCasesPage = lazy(() => import("./pages/TestCasesPage").then((module) => ({ default: module.TestCasesPage })));
const TestEnvironmentPage = lazy(() => import("./pages/TestEnvironmentPage").then((module) => ({ default: module.TestEnvironmentPage })));
const TestOpsPage = lazy(() => import("./pages/TestOpsPage").then((module) => ({ default: module.TestOpsPage })));

const PAGE_TITLES: Record<string, { key?: string; fallback: string }> = {
  "/": { key: "page.overview", fallback: "Overview" },
  "/people": { key: "page.people", fallback: "People" },
  "/admin-space": { key: "page.adminSpace", fallback: "Admin Space" },
  "/projects": { key: "page.projects", fallback: "Projects" },
  "/integrations": { key: "page.integrations", fallback: "Integrations" },
  "/design": { key: "page.design", fallback: "Test Design" },
  "/requirements": { key: "page.requirements", fallback: "Requirements" },
  "/issues": { key: "page.issues", fallback: "Bugs" },
  "/feedback": { key: "page.issues", fallback: "Bugs" },
  "/support": { key: "page.support", fallback: "Support" },
  "/notifications": { key: "page.notifications", fallback: "Notifications" },
  "/settings": { key: "page.settings", fallback: "Settings" },
  "/test-cases": { key: "page.testCases", fallback: "Test Cases" },
  "/shared-steps": { key: "page.sharedSteps", fallback: "Shared Step Groups" },
  "/executions": { key: "page.executions", fallback: "Test Runs" },
  "/automation": { fallback: "Automation Cases" },
  "/object-repository": { fallback: "Object Repository" },
  "/agentic-workflows": { key: "page.agenticWorkflows", fallback: "Agentic Workflows" },
  "/testops": { fallback: "Batch Process" },
  "/ops-telemetry": { fallback: "OPS Telemetry" },
  "/traces": { fallback: "Distributed Traces" },
  "/test-environments": { key: "page.testEnvironments", fallback: "Test Environments" },
  "/test-data": { key: "page.testData", fallback: "Test Data" },
  "/test-configurations": { key: "page.testConfigurations", fallback: "Test Configurations" },
  "/knowledge-repo": { key: "page.knowledgeRepo", fallback: "Knowledge Repo" },
  "/auth": { fallback: "Sign In" },
  "/signup": { fallback: "Sign Up" }
};

function ThemeBootstrap() {
  useEffect(() => {
    writeWorkspaceTheme(readWorkspaceTheme());
  }, []);

  return null;
}

function PageTitleUpdater() {
  const location = useLocation();
  const { t } = useLocalization();

  useEffect(() => {
    const meta = PAGE_TITLES[location.pathname];
    document.title = meta ? `${meta.key ? t(meta.key, meta.fallback) : meta.fallback} · QAira` : "QAira";
  }, [location.pathname, t]);

  return null;
}

function RouteContinuityManager() {
  const location = useLocation();
  const navigate = useNavigate();
  const checkedInitialRouteRef = useRef(false);

  useEffect(() => {
    const route = getRouteFromLocation(location);
    const isRootRoute = location.pathname === "/" && !location.search && !location.hash;

    if (!checkedInitialRouteRef.current) {
      checkedInitialRouteRef.current = true;

      if (isRootRoute && isBrowserReload()) {
        const previousRoute = readCurrentWorkspaceRoute();

        if (previousRoute && previousRoute !== "/") {
          navigate(previousRoute, { replace: true });
          return;
        }
      }
    }

    rememberCurrentWorkspaceRoute(route);
  }, [location, navigate]);

  return null;
}

function ProtectedLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return <div className="splash-screen"><LoadingState label="Connecting Qaira to Jira" /></div>;
  }

  if (!session) {
    return (
      <div className="splash-screen">
        <AppErrorState
          fallbackMessage="Qaira could not establish the Jira session. Refresh the page or contact your Jira administrator."
          onRetry={() => window.location.reload()}
          title="Jira session unavailable"
        />
      </div>
    );
  }

  return (
    <>
      <RouteContinuityManager />
      <PageTitleUpdater />
      <AppShell />
    </>
  );
}

const router = createHashRouter([
  {
    path: "/",
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "admin-space", element: <AdminSpacePage /> },
      { path: "people", element: <PeoplePage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "integrations", element: <IntegrationsPage /> },
      { path: "design", element: <DesignPage /> },
      { path: "requirements", element: <RequirementsPage /> },
      { path: "issues", element: <IssuesPage /> },
      { path: "feedback", element: <Navigate to="/issues" replace /> },
      { path: "support", element: <SupportPage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "test-cases", element: <TestCasesPage /> },
      { path: "shared-steps", element: <SharedStepsPage /> },
      { path: "executions", element: <ExecutionsPage /> },
      { path: "automation", element: <AutomationPage initialView="cases" /> },
      { path: "object-repository", element: <AutomationPage initialView="repository" /> },
      { path: "agentic-workflows", element: <AgenticWorkflowsPage /> },
      { path: "local-playwright", element: <Navigate to="/automation" replace /> },
      { path: "testops", element: <TestOpsPage initialView="batch-process" /> },
      { path: "ops-telemetry", element: <TestOpsPage initialView="ops-telemetry" /> },
      { path: "traces", element: <TestOpsPage initialView="traces" /> },
      { path: "test-environments", element: <TestEnvironmentPage view="environments" /> },
      { path: "test-data", element: <TestEnvironmentPage view="data" /> },
      { path: "test-configurations", element: <TestEnvironmentPage view="configurations" /> },
      { path: "knowledge-repo", element: <KnowledgeRepoPage /> }
    ]
  }
]);

export function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeBootstrap />
        <AuthProvider>
          <LocalizationProvider>
            <Suspense fallback={<div className="splash-screen"><LoadingState label="Loading workspace" /></div>}>
              <RouterProvider router={router} />
            </Suspense>
          </LocalizationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
