import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavigationTarget, realtime, router, showFlag } from "@forge/bridge";
import { useAuth } from "../auth/AuthContext";
import { useLocalization } from "../context/LocalizationContext";
import { AppTypeInlineValue } from "./AppTypeDropdown";
import { RefreshIcon } from "./AppIcons";
import { BrandWordmark } from "./BrandWordmark";
import { LoadingState } from "./LoadingState";
import { setCurrentScope, useCurrentAppType, useCurrentProject } from "../hooks/useCurrentProject";
import { useDomainMetadata } from "../hooks/useDomainMetadata";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { api } from "../lib/api";
import { areFeatureFlagsEnabled, requiredFeatureFlagsForPath } from "../lib/featureFlags";
import { getNavigationItemLabel, getNavigationItemPermissions, isNavigationItemActive } from "../lib/navigation";
import { getUnreadNotificationCount, NOTIFICATIONS_UPDATED_EVENT } from "../lib/notificationCenter";
import { readNotificationPreferences } from "../lib/notificationPreferences";
import { canAccessPath, hasAnyPermission } from "../lib/permissions";
import { queryKeys } from "../lib/queryKeys";
import { preloadWorkspaceRoute } from "../lib/routePrefetch";
import {
  PREFERENCES_UPDATED_EVENT,
  readSidebarMode,
  readWorkspaceTheme,
  writeSidebarMode,
  writeWorkspaceTheme,
  type SidebarMode,
  type WorkspacePreferenceUpdate
} from "../lib/workspacePreferences";
import {
  AGENTIC_WORKFLOW_SECTION_ITEMS,
  AUTOMATION_SECTION_ITEMS,
  DASHBOARD_SECTION_ITEMS,
  TEST_AUTHORING_SECTION_ITEMS,
  TEST_ENVIRONMENT_SECTION_ITEMS,
  TEST_RUNS_SECTION_ITEMS,
  TESTOPS_SECTION_ITEMS,
  WORKSPACE_LIBRARY_PATHS,
  WORKSPACE_PAGE_LABELS,
  WORKSPACE_SECTION_LABEL_KEYS
} from "../lib/workspaceSections";
import type { AppNotification, AppType, Project } from "../types";

const MOBILE_SIDEBAR_BREAKPOINT = "(max-width: 768px)";
const NOTIFICATION_REALTIME_CHANNEL = "qaira-notifications";
const JIRA_PROJECT_PAGE_MODULE_KEY = "qaira-project-workspace";

const navigation = [
  {
    label: "Workspace",
    items: [
      { id: "overview", to: "/", label: "Home", shortLabel: "Home", icon: DashboardIcon, matchPaths: ["/"], featureKeys: ["qaira.analytics.dashboards"] },
      { id: "projects", to: "/projects", label: "Projects", shortLabel: "Projects", icon: FolderIcon, countKey: "projects", featureKeys: ["qaira.ops.projects"] }
    ]
  },
  {
    label: "Create",
    items: [
      {
        id: "authoring",
        to: "/test-cases",
        label: "Library",
        shortLabel: "Library",
        icon: FlaskIcon,
        matchPaths: TEST_AUTHORING_SECTION_ITEMS.map((item) => item.to),
        featureKeys: ["qaira.manual.requirements", "qaira.manual.test_cases", "qaira.manual.suites"],
        featureMatch: "any",
        disabledWhenNoProjects: true
      },
      {
        id: "automation",
        to: "/automation",
        label: "Automation",
        shortLabel: "Auto",
        icon: AutomationIcon,
        matchPaths: AUTOMATION_SECTION_ITEMS.map((item) => item.to),
        featureKeys: ["qaira.automation.workspace"],
        disabledWhenNoProjects: true
      },
      {
        id: "agentic-workflows",
        to: "/agentic-workflows",
        label: "Agentic Workflows",
        shortLabel: "Agents",
        icon: WorkflowIcon,
        featureKeys: ["qaira.ai.agentic_workflows"],
        disabledWhenNoProjects: true
      },
      {
        id: "runs",
        to: "/executions",
        label: "Runs",
        shortLabel: "Runs",
        icon: PlayIcon,
        matchPaths: ["/executions"],
        featureKeys: ["qaira.manual.runs"],
        disabledWhenNoProjects: true
      },
      { id: "issues", to: "/issues", label: "Bugs", shortLabel: "Bugs", icon: BugIcon, featureKeys: ["qaira.manual.bugs"] },
      {
        id: "testops",
        to: "/testops",
        label: "TestOps",
        shortLabel: "TestOps",
        icon: ActivityIcon,
        matchPaths: TESTOPS_SECTION_ITEMS.map((item) => item.to),
        featureKeys: ["qaira.automation.batch_process", "qaira.ops.telemetry"],
        featureMatch: "any",
        disabledWhenNoProjects: true
      },
      {
        id: "environment",
        to: "/test-environments",
        label: "Environments",
        shortLabel: "Env",
        icon: ServerIcon,
        matchPaths: TEST_ENVIRONMENT_SECTION_ITEMS.map((item) => item.to),
        featureKeys: ["qaira.manual.environments"],
        disabledWhenNoProjects: true
      },
      { id: "knowledge", to: "/knowledge-repo", label: "Knowledge Repo", shortLabel: "Knowledge", icon: OpenBookIcon, featureKeys: ["qaira.ai.knowledge"] }
    ]
  },
  {
    label: "Connect",
    items: [
      {
        id: "admin-space",
        to: "/admin-space",
        label: "Admin Space",
        shortLabel: "Admin",
        icon: UsersIcon,
        matchPaths: ["/admin-space", "/people", "/integrations", "/settings"]
      }
    ]
  },
  {
    label: "Settings",
    items: [
      { id: "notifications", to: "/notifications", label: "Notifications", shortLabel: "Alerts", icon: BellIcon, featureKeys: ["qaira.ops.notifications"] },
      { id: "support", to: "/support", label: "Support", shortLabel: "Support", icon: SupportIcon }
    ]
  }
] as const;

type SidebarScopeSelectorProps = {
  isCollapsed: boolean;
  isLoadingProjects: boolean;
  onProjectChange: (value: string | number) => void;
  onProjectNavigate: (value: string | number) => void;
  projectId: string;
  projects: Project[];
};

type SidebarScopePopoverPosition = {
  left: number;
  top: number;
  width: number;
};

function SidebarScopeProjectBranch({
  appTypeId,
  isExpanded,
  isSelected,
  onSelectAppType,
  onSelectProject,
  onToggle,
  project
}: {
  appTypeId: string;
  isExpanded: boolean;
  isSelected: boolean;
  onSelectAppType: (projectId: string, appTypeId: string) => void;
  onSelectProject: (projectId: string) => void;
  onToggle: (projectId: string) => void;
  project: Project;
}) {
  const projectRef = String(project.id);
  const appTypesQuery = useQuery({
    queryKey: queryKeys.appTypes(projectRef),
    queryFn: () => api.appTypes.list({ project_id: projectRef }),
    enabled: isExpanded,
    retry: 1,
    staleTime: 60 * 1000
  });
  const appTypes = appTypesQuery.data || [];

  return (
    <div
      aria-expanded={isExpanded}
      aria-selected={isSelected}
      className={isSelected ? "sidebar-scope-project-branch is-selected" : "sidebar-scope-project-branch"}
      role="treeitem"
    >
      <div className="sidebar-scope-project-row">
        <button
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${project.name} application spaces`}
          className="sidebar-scope-branch-toggle"
          onClick={() => onToggle(projectRef)}
          type="button"
        >
          <span className={isExpanded ? "sidebar-scope-branch-chevron is-expanded" : "sidebar-scope-branch-chevron"} aria-hidden="true">
            <ChevronIcon />
          </span>
        </button>
        <button
          className="sidebar-scope-project-option"
          onClick={() => onSelectProject(projectRef)}
          type="button"
        >
          <strong>{project.name}</strong>
          <span>{project.display_id || project.description || "Jira project"}</span>
        </button>
      </div>
      {isExpanded ? (
        <div className="sidebar-scope-app-type-list" role="group" aria-label={`${project.name} application spaces`}>
          {appTypesQuery.isPending ? <LoadingState label="Loading application spaces" /> : null}
          {!appTypesQuery.isPending && appTypes.map((appType: AppType) => {
            const isAppTypeSelected = isSelected && appType.id === appTypeId;
            return (
              <button
                aria-pressed={isAppTypeSelected}
                className={isAppTypeSelected ? "sidebar-scope-app-type-option is-selected" : "sidebar-scope-app-type-option"}
                key={appType.id}
                onClick={() => onSelectAppType(projectRef, appType.id)}
                type="button"
              >
                <AppTypeInlineValue isUnified={appType.is_unified} label={appType.name} type={appType.type} />
              </button>
            );
          })}
          {!appTypesQuery.isPending && !appTypes.length ? (
            <div className="sidebar-scope-empty">No application spaces in this project.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SidebarScopeSelector({
  isCollapsed,
  isLoadingProjects,
  onProjectChange,
  onProjectNavigate,
  projectId,
  projects
}: SidebarScopeSelectorProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [areProjectsExpanded, setAreProjectsExpanded] = useState(true);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>(() => projectId ? [String(projectId)] : []);
  const [popoverPosition, setPopoverPosition] = useState<SidebarScopePopoverPosition | null>(null);
  const [appTypeId, setAppTypeId] = useCurrentAppType(projectId);
  const appTypesQuery = useQuery({
    queryKey: queryKeys.appTypes(projectId),
    queryFn: () => api.appTypes.list({ project_id: projectId }),
    enabled: Boolean(projectId),
    retry: 1,
    staleTime: 60 * 1000
  });

  const appTypes = appTypesQuery.data || [];
  const currentProject = projects.find((project) => String(project.id) === String(projectId)) || null;
  const currentAppType = appTypes.find((appType) => appType.id === appTypeId) || null;
  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();

    if (!query) {
      return projects;
    }

    return projects.filter((project) =>
      [project.name, project.display_id || "", project.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [projectSearch, projects]);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger || typeof window === "undefined") {
      return;
    }

    const bounds = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(390, Math.max(240, window.innerWidth - viewportPadding * 2));
    const estimatedHeight = Math.min(430, window.innerHeight - viewportPadding * 2);
    const preferredLeft = isCollapsed ? bounds.right + 10 : bounds.left;
    const preferredTop = isCollapsed ? bounds.top : bounds.bottom + 8;
    const left = Math.min(Math.max(viewportPadding, preferredLeft), window.innerWidth - width - viewportPadding);
    const top = Math.min(
      Math.max(viewportPadding, preferredTop),
      Math.max(viewportPadding, window.innerHeight - estimatedHeight - viewportPadding)
    );

    setPopoverPosition({ left, top, width });
  }, [isCollapsed]);

  useEffect(() => {
    if (!appTypesQuery.isPending && projectId && appTypes.length && !appTypes.some((appType) => appType.id === appTypeId)) {
      setAppTypeId(appTypes[0].id);
    }

    if (!appTypesQuery.isPending && projectId && !appTypes.length && appTypeId) {
      setAppTypeId("");
    }
  }, [appTypeId, appTypes, appTypesQuery.isPending, projectId, setAppTypeId]);

  useEffect(() => {
    if (!projectId) return;
    setExpandedProjectIds((current) => current.includes(String(projectId)) ? current : [...current, String(projectId)]);
  }, [projectId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePopoverPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (!target || triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const currentProjectName =
    currentProject?.name || (isLoadingProjects ? "Loading project" : projects.length ? "Select project" : "No projects");
  const currentAppTypeName =
    currentAppType?.name || (appTypesQuery.isPending ? "Loading app type" : projectId ? "Select app type" : "Choose project first");

  const handleTriggerClick = () => {
    if (!isOpen) {
      updatePopoverPosition();
    }

    setIsOpen((current) => !current);
  };

  const toggleProjectBranch = (targetProjectId: string) => {
    setExpandedProjectIds((current) => current.includes(targetProjectId)
      ? current.filter((value) => value !== targetProjectId)
      : [...current, targetProjectId]);
  };

  const selectProject = (targetProjectId: string) => {
    onProjectChange(targetProjectId);
    onProjectNavigate(targetProjectId);
    setExpandedProjectIds((current) => current.includes(targetProjectId) ? current : [...current, targetProjectId]);
    setProjectSearch("");
  };

  const selectAppType = (targetProjectId: string, targetAppTypeId: string) => {
    setCurrentScope(targetProjectId, targetAppTypeId);
    onProjectNavigate(targetProjectId);
    setIsOpen(false);
    setProjectSearch("");
  };

  const selectorPopover =
    isOpen && popoverPosition
      ? createPortal(
          <div
            className="sidebar-scope-popover"
            ref={popoverRef}
            role="dialog"
            aria-label="Select project and app type"
            style={{
              left: popoverPosition.left,
              top: popoverPosition.top,
              width: popoverPosition.width
            }}
          >
            <div className="sidebar-scope-popover-head">
              <span>Workspace Scope</span>
              <strong>{currentProjectName}</strong>
            </div>
            <label className="sidebar-scope-search">
              <span>Project</span>
              <input
                autoFocus
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder="Search projects"
                type="search"
                value={projectSearch}
              />
            </label>
            <section className="sidebar-scope-tree-section">
              <button
                aria-expanded={areProjectsExpanded}
                className="sidebar-scope-tree-heading"
                onClick={() => setAreProjectsExpanded((current) => !current)}
                type="button"
              >
                <span className={areProjectsExpanded ? "sidebar-scope-branch-chevron is-expanded" : "sidebar-scope-branch-chevron"} aria-hidden="true">
                  <ChevronIcon />
                </span>
                <span>Projects and application spaces</span>
                <em>{filteredProjects.length}</em>
              </button>
              {areProjectsExpanded ? (
                <div className="sidebar-scope-project-list" role="tree" aria-label="Projects and application spaces">
                  {filteredProjects.map((project) => (
                    <SidebarScopeProjectBranch
                      appTypeId={appTypeId}
                      isExpanded={expandedProjectIds.includes(String(project.id))}
                      isSelected={String(project.id) === String(projectId)}
                      key={project.id}
                      onSelectAppType={selectAppType}
                      onSelectProject={selectProject}
                      onToggle={toggleProjectBranch}
                      project={project}
                    />
                  ))}
                  {!filteredProjects.length ? <div className="sidebar-scope-empty">No matching projects.</div> : null}
                </div>
              ) : null}
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={isCollapsed ? "sidebar-scope-selector is-collapsed" : "sidebar-scope-selector"}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Select project and app type"
        className="sidebar-scope-trigger"
        disabled={isLoadingProjects || !projects.length}
        onClick={handleTriggerClick}
        ref={triggerRef}
        title={isCollapsed ? `${currentProjectName} - ${currentAppTypeName}` : undefined}
        type="button"
      >
        <span className="sidebar-scope-icon" aria-hidden="true">
          <ProjectScopeIcon />
        </span>
        {!isCollapsed ? (
          <>
            <span className="sidebar-scope-copy">
              <span>Current Project</span>
              <strong>{currentProjectName}</strong>
              <em>{currentAppTypeName}</em>
            </span>
            <span className="sidebar-scope-caret" aria-hidden="true">
              <ChevronIcon />
            </span>
          </>
        ) : null}
      </button>
      {selectorPopover}
    </div>
  );
}

export function AppShell() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, error, clearError } = useAuth();
  const { t } = useLocalization();
  const domainMetadataQuery = useDomainMetadata();
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: api.projects.list,
    retry: 1,
    staleTime: 60 * 1000
  });
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const [sidebarProjectId, setSidebarProjectId] = useCurrentProject();
  const serverUnreadNotificationCountQuery = useQuery({
    queryKey: ["notifications", "unread", sidebarProjectId || "workspace"],
    queryFn: api.notifications.unreadCount,
    enabled: Boolean(session),
    refetchInterval: 300_000,
    staleTime: 240_000
  });
  const [theme, setTheme] = useState(readWorkspaceTheme);
  const [isCollapsed, setIsCollapsed] = useState(() => readSidebarMode() === "collapsed");
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia(MOBILE_SIDEBAR_BREAKPOINT).matches);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(() => getUnreadNotificationCount());
  const notificationRealtimeTokenQuery = useQuery({
    queryKey: ["notifications", "realtime-token", sidebarProjectId || "workspace"],
    queryFn: api.notifications.realtimeToken,
    enabled: Boolean(session),
    refetchInterval: 10 * 60_000,
    staleTime: 9 * 60_000
  });
  const knownServerNotificationIds = useRef(new Set<string>());

  const projects = projectsQuery.data || [];
  const hasNoProjects = !projectsQuery.isPending && projects.length === 0;
  const currentProjectName =
    projects.find((project) => String(project.id) === String(sidebarProjectId))?.name ||
    (hasNoProjects ? "No active project" : "Select a project");
  const navCounts = {
    projects: projects.length
  };
  const notificationPreferences = readNotificationPreferences();
  const visibleServerUnreadCount = Object.entries(serverUnreadNotificationCountQuery.data?.by_preference || {})
    .reduce((total, [preference, count]) => {
      if (preference !== "unspecified" && notificationPreferences[preference as keyof typeof notificationPreferences] === false) return total;
      return total + Number(count || 0);
    }, 0);
  const totalNotificationUnreadCount = notificationUnreadCount + visibleServerUnreadCount;

  const showAppNotification = useCallback((item: AppNotification) => {
    const preferences = readNotificationPreferences();
    const preference = item.preference as keyof typeof preferences | undefined;
    if (!preferences.inApp || (preference && preferences[preference] === false)) return;
    if (item.user_id && String(item.user_id) !== String(session?.user.id || "")) return;
    if (knownServerNotificationIds.current.has(item.id)) return;
    knownServerNotificationIds.current.add(item.id);
    const type = item.tone === "error" ? "error" : item.tone === "warning" ? "warning" : item.tone === "success" ? "success" : "info";
    try {
      showFlag({
        id: `qaira-${item.id}`,
        title: item.title,
        description: item.message,
        type,
        isAutoDismiss: type !== "error" && type !== "warning",
        ...(item.target_url ? { actions: [{ text: "View", onClick: () => navigate(item.target_url || "/notifications") }] } : {})
      });
    } catch {
      // The persistent notification center and polling path remain available outside an Atlassian host frame.
    }
  }, [navigate, session?.user.id]);

  useEffect(() => {
    knownServerNotificationIds.current.clear();
  }, [sidebarProjectId]);

  useEffect(() => {
    const token = notificationRealtimeTokenQuery.data?.token;
    if (!session?.user.id || !token) return undefined;
    const subscription = realtime.subscribeGlobal(NOTIFICATION_REALTIME_CHANNEL, (payload) => {
      let item: AppNotification | null = null;
      try {
        item = (typeof payload === "string" ? JSON.parse(payload) : payload) as AppNotification;
      } catch {
        item = null;
      }
      if (!item?.id) return;
      showAppNotification(item);
      void Promise.all([
        queryClient.resetQueries({ queryKey: ["notifications", "feed", sidebarProjectId || "workspace"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "unread", sidebarProjectId || "workspace"], exact: true })
      ]);
    }, { token });
    return () => {
      void subscription.then((activeSubscription) => activeSubscription.unsubscribe()).catch(() => undefined);
    };
  }, [notificationRealtimeTokenQuery.data?.token, queryClient, session?.user.id, showAppNotification, sidebarProjectId]);

  useEffect(() => {
    writeWorkspaceTheme(theme);
  }, [theme]);

  useEffect(() => {
    writeSidebarMode(isCollapsed ? "collapsed" : "expanded");
  }, [isCollapsed]);

  useEffect(() => {
    const syncNotifications = () => setNotificationUnreadCount(getUnreadNotificationCount());

    syncNotifications();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, syncNotifications);
    window.addEventListener("storage", syncNotifications);
    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, syncNotifications);
      window.removeEventListener("storage", syncNotifications);
    };
  }, []);

  useEffect(() => {
    const syncPreferences = (event?: Event) => {
      const detail =
        event && "detail" in event
          ? (event as CustomEvent<WorkspacePreferenceUpdate>).detail
          : undefined;
      const nextTheme = detail?.theme || readWorkspaceTheme();
      const nextSidebarMode: SidebarMode = detail?.sidebarMode ?? readSidebarMode();

      if (nextTheme === "light" || nextTheme === "dark") {
        setTheme(nextTheme);
      }

      setIsCollapsed(nextSidebarMode === "collapsed");
    };

    window.addEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences as EventListener);
    window.addEventListener("storage", syncPreferences);

    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences as EventListener);
      window.removeEventListener("storage", syncPreferences);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_SIDEBAR_BREAKPOINT);

    const syncViewport = (event: MediaQueryList | MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    syncViewport(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsMobileSidebarOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    if (!isMobileViewport || !isMobileSidebarOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileSidebarOpen, isMobileViewport]);

  useEffect(() => {
    if (projectsQuery.isPending) {
      return;
    }

    if (!projects.length) {
      if (sidebarProjectId) {
        setSidebarProjectId("");
      }
      return;
    }

    if (!sidebarProjectId || !projects.some((project) => String(project.id) === String(sidebarProjectId))) {
      setSidebarProjectId(projects[0].id);
    }
  }, [projects, projectsQuery.isPending, setSidebarProjectId, sidebarProjectId]);

  const navigateToJiraProject = useCallback((nextProjectId: string | number) => {
    const normalizedProjectId = String(nextProjectId);
    const isProjectChange = normalizedProjectId !== String(sidebarProjectId);

    if (!isProjectChange) {
      return;
    }

    const projectKey = String(
      projects.find((project) => String(project.id) === normalizedProjectId)?.display_id || ""
    ).trim();
    if (!projectKey) {
      console.warn("Qaira could not switch Jira's native project URL because the selected project has no Jira key.", {
        projectId: normalizedProjectId
      });
      return;
    }

    void router.navigate({
      target: NavigationTarget.Module,
      moduleKey: JIRA_PROJECT_PAGE_MODULE_KEY,
      projectKey
    }).catch((navigationError) => {
      console.warn("Qaira could not switch Jira's native project URL.", {
        message: navigationError instanceof Error ? navigationError.message : String(navigationError),
        projectKey
      });
    });
  }, [projects, sidebarProjectId]);

  const isWorkspaceWideLibrary = WORKSPACE_LIBRARY_PATHS.has(location.pathname);

  const currentSection = useMemo(() => WORKSPACE_PAGE_LABELS[location.pathname] || "Workspace", [location.pathname]);
  const pageAccess = domainMetadataQuery.data?.access?.pages;
  const canAccessCurrentRoute = canAccessPath(session, location.pathname, pageAccess);
  const currentFeatureKeys = requiredFeatureFlagsForPath(location.pathname);
  const canAccessCurrentFeature = areFeatureFlagsEnabled(
    featureFlagsQuery.data,
    currentFeatureKeys
  );
  const canAccessNavigationFeature = (item: { id: string; featureKeys?: readonly string[]; featureMatch?: "any" }) => {
    const keys = item.featureKeys || [];
    if (item.featureMatch === "any") {
      return Boolean(featureFlagsQuery.data) && keys.some((key) => featureFlagsQuery.data?.flags[key] === true);
    }
    return areFeatureFlagsEnabled(featureFlagsQuery.data, keys);
  };

  const shouldCollapseSidebar = !isMobileViewport && isCollapsed;
  const sidebarClassName = `${shouldCollapseSidebar ? "sidebar is-collapsed" : "sidebar"}${isMobileSidebarOpen ? " is-mobile-open" : ""}`;

  useEffect(() => {
    document.documentElement.dataset.sidebar = shouldCollapseSidebar ? "collapsed" : "expanded";
  }, [shouldCollapseSidebar]);

  const toggleSidebarCollapse = () => {
    setIsCollapsed((current) => !current);
  };

  const resolveNavLabel = (item: { id: string; label: string; shortLabel?: string }) => {
    const defaultLabel = getNavigationItemLabel(item, shouldCollapseSidebar);

    switch (item.id) {
      case "overview":
        return t("nav.dashboard", defaultLabel);
      case "projects":
        return t("nav.projects", defaultLabel);
      case "authoring":
        return t("nav.testAuthoring", defaultLabel);
      case "runs":
        return t("nav.testRuns", defaultLabel);
      case "agentic-workflows":
        return t("nav.agenticWorkflows", defaultLabel);
      case "admin-space":
        return t("nav.adminSpace", defaultLabel);
      case "automation":
        return defaultLabel;
      case "testops":
        return defaultLabel;
      case "environment":
        return t("nav.testEnvironment", defaultLabel);
      case "people":
        return t("nav.users", defaultLabel);
      case "integrations":
        return t("nav.integrations", defaultLabel);
      case "knowledge":
        return t("nav.knowledge", defaultLabel);
      case "support":
        return t("nav.support", defaultLabel);
      case "notifications":
        return t("nav.notifications", defaultLabel);
      case "settings":
        return t("nav.settings", defaultLabel);
      case "issues":
        return t("nav.reportIssue", defaultLabel);
      default:
        return defaultLabel;
    }
  };

  const resolveSubItemLabel = (subItem: { to: string; label: string }) => {
    const labelKey = WORKSPACE_SECTION_LABEL_KEYS[subItem.to];
    return labelKey ? t(labelKey, subItem.label) : subItem.label;
  };

  const resolveSidebarSubItems = (item: { id: string }) => {
    const items = item.id === "overview"
      ? DASHBOARD_SECTION_ITEMS
      : item.id === "authoring"
      ? TEST_AUTHORING_SECTION_ITEMS
      : item.id === "automation"
        ? AUTOMATION_SECTION_ITEMS
        : item.id === "testops"
          ? TESTOPS_SECTION_ITEMS
          : item.id === "environment"
            ? TEST_ENVIRONMENT_SECTION_ITEMS
            : item.id === "runs"
              ? TEST_RUNS_SECTION_ITEMS
              : item.id === "agentic-workflows"
                ? AGENTIC_WORKFLOW_SECTION_ITEMS
                : [];
    return items.filter((subItem) => areFeatureFlagsEnabled(featureFlagsQuery.data, subItem.featureKeys || []));
  };

  const refreshCurrentScreen = () => window.location.reload();
  const prefetchNavigationTarget = (target: string, disabled = false) => {
    if (!disabled) {
      preloadWorkspaceRoute(target);
    }
  };

  return (
    <div className="app-shell app-layout app-layout--workspace-wide">
      {error && (
        <div className="global-alert" role="alert">
          <p>{error}</p>
          <button 
            className="ghost-button" 
            onClick={clearError}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}
      {!error && hasNoProjects ? (
        <div className="global-alert" role="status">
          <p>No default QAira project is available for your account. Create a project from the Projects page to start working.</p>
          <NavLink className="ghost-button" to="/projects">Create project</NavLink>
        </div>
      ) : null}
      
      <aside className={sidebarClassName} id="app-sidebar" role="navigation">
        <div className="sidebar-top">
          <div className="sidebar-brand-row">
            <NavLink className="sidebar-brand-lockup" to="/" aria-label="Go to dashboard">
              <BrandWordmark className="sidebar-brand-mark" variant={shouldCollapseSidebar ? "mark" : "wordmark"} />
            </NavLink>
            {isMobileViewport ? (
              <button
                aria-label="Close navigation"
                className="sidebar-mobile-close ghost-button"
                onClick={() => setIsMobileSidebarOpen(false)}
                type="button"
              >
                <CloseIcon />
              </button>
            ) : null}
            {!isMobileViewport ? (
              <button
                aria-label={shouldCollapseSidebar ? "Expand sidebar" : "Collapse sidebar"}
                className="sidebar-collapse-button ghost-button"
                onClick={toggleSidebarCollapse}
                type="button"
              >
                <MenuIcon />
              </button>
            ) : null}
          </div>

          {!hasNoProjects ? (
            <SidebarScopeSelector
              isCollapsed={shouldCollapseSidebar}
              isLoadingProjects={projectsQuery.isPending}
              onProjectChange={setSidebarProjectId}
              onProjectNavigate={navigateToJiraProject}
              projectId={sidebarProjectId}
              projects={projects}
            />
          ) : !shouldCollapseSidebar ? (
            <div className="sidebar-notice">
              <p>No projects assigned yet.</p>
              <p className="text-muted">Ask an admin to add you to a project.</p>
            </div>
          ) : null}
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              {!shouldCollapseSidebar ? (
                <p className="nav-group-label">
                  {group.label === "Workspace"
                    ? t("nav.section.main", group.label)
                    : group.label === "Create"
                      ? t("nav.section.testManagement", group.label)
                      : group.label === "Connect"
                        ? t("nav.section.administration", group.label)
                        : t("nav.section.settings", group.label)}
                </p>
              ) : null}
              <div className="nav-group-items">
                {group.items.map((item) => {
                  if (!hasAnyPermission(session, getNavigationItemPermissions(item, pageAccess))) {
                    return null;
                  }

                  if (!canAccessNavigationFeature(item)) {
                    return null;
                  }

                  const Icon = item.icon;
                  const isDisabled = Boolean("disabledWhenNoProjects" in item && item.disabledWhenNoProjects && hasNoProjects);
                  const badgeCount = item.id === "notifications"
                    ? totalNotificationUnreadCount
                    : "countKey" in item
                      ? navCounts[item.countKey as keyof typeof navCounts]
                      : undefined;
                  const isActive = isNavigationItemActive(item, location.pathname);
                  const subItems = resolveSidebarSubItems(item);
                  const primaryFeatureEnabled = areFeatureFlagsEnabled(
                    featureFlagsQuery.data,
                    requiredFeatureFlagsForPath(item.to)
                  );
                  const navigationTarget = primaryFeatureEnabled ? item.to : subItems[0]?.to || item.to;

                  return (
                    <div className="nav-item-stack" key={item.to}>
                      <NavLink
                        aria-current={isActive ? "page" : undefined}
                        to={navigationTarget}
                        replace={isActive && `${location.pathname}${location.search}` !== navigationTarget}
                        className={isActive ? "nav-link is-active" : "nav-link"}
                        end={item.to === "/"}
                        title={shouldCollapseSidebar ? resolveNavLabel(item) : undefined}
                        aria-label={resolveNavLabel(item)}
                        onFocus={() => prefetchNavigationTarget(navigationTarget, isDisabled)}
                        onMouseEnter={() => prefetchNavigationTarget(navigationTarget, isDisabled)}
                        onClick={(e) => {
                          if (isDisabled) {
                            e.preventDefault();
                            return;
                          }
                          if (shouldCollapseSidebar && subItems.length) {
                            setIsCollapsed(false);
                          }
                        }}
                        style={{ opacity: isDisabled ? 0.5 : 1, cursor: isDisabled ? "not-allowed" : "pointer" }}
                      >
                        <span className="nav-link-icon" aria-hidden="true">
                          <Icon />
                          {item.id === "notifications" && totalNotificationUnreadCount > 0 ? (
                            <span className="nav-link-icon-badge">{totalNotificationUnreadCount > 99 ? "99+" : totalNotificationUnreadCount}</span>
                          ) : null}
                        </span>
                        <span className="nav-link-label">{resolveNavLabel(item)}</span>
                        {!shouldCollapseSidebar && typeof badgeCount === "number" && badgeCount > 0 ? (
                          <span className={item.id === "notifications" ? "nav-link-badge is-alert" : "nav-link-badge"}>{badgeCount > 99 ? "99+" : badgeCount}</span>
                        ) : null}
                      </NavLink>
                      {!shouldCollapseSidebar && subItems.length && isActive ? (
                        <div className="nav-submenu" aria-label={`${resolveNavLabel(item)} sections`}>
                          {subItems.map((subItem) => {
                            const subPath = subItem.to.split("?")[0];
                            const isDefaultDashboardView = item.id === "overview"
                              && subItem.to === "/?view=analytics"
                              && location.pathname === "/"
                              && (!location.search || new URLSearchParams(location.search).get("view") === "analytics");
                            const isSubActive = isDefaultDashboardView || (subItem.to.includes("?")
                              ? `${location.pathname}${location.search}` === subItem.to
                              : location.pathname === subPath);
                            const SubIcon = getWorkspaceSubItemIcon("icon" in subItem ? subItem.icon : undefined);

                            return (
                              <NavLink
                                className={isSubActive ? "nav-submenu-link is-active" : "nav-submenu-link"}
                                key={subItem.to}
                                onFocus={() => preloadWorkspaceRoute(subItem.to)}
                                onMouseEnter={() => preloadWorkspaceRoute(subItem.to)}
                                to={subItem.to}
                              >
                                <span className="nav-submenu-icon" aria-hidden="true"><SubIcon /></span>
                                {resolveSubItemLabel(subItem)}
                              </NavLink>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            aria-label="Refresh current screen"
            className={`sidebar-refresh-button ghost-button${shouldCollapseSidebar ? " explorer-icon-button" : ""}`}
            onClick={refreshCurrentScreen}
            title="Refresh current screen"
            type="button"
          >
            {!shouldCollapseSidebar ? <span className="sidebar-refresh-label">Refresh</span> : null}
            <RefreshIcon size={20} />
          </button>

          {!shouldCollapseSidebar ? (
            <div className="theme-toggle">
              <div>
                <strong>Theme</strong>
                <span>{theme === "light" ? "Light · follows Jira" : "Dark · follows Jira"}</span>
              </div>
              <span aria-hidden="true" className="theme-jira-indicator">Jira</span>
            </div>
          ) : (
            <span
              aria-label={`Theme follows Jira (${theme})`}
              className={theme === "dark" ? "sidebar-icon-button is-dark" : "sidebar-icon-button"}
              role="img"
              title={`Theme follows Jira (${theme})`}
            >
              {theme === "dark" ? <MoonIcon /> : <SunIcon />}
            </span>
          )}

          <div
            aria-label="Current Jira profile"
            className="user-chip"
            title={shouldCollapseSidebar ? (session?.user.name || "Workspace user") : undefined}
          >
            <div className="user-chip-head">
              <span className="user-chip-icon" aria-hidden="true">
                {session?.user.avatar_data_url ? <img alt="" className="user-chip-avatar" src={session.user.avatar_data_url} /> : <UserIcon />}
              </span>
              <div className="user-chip-copy">
                <strong>{session?.user.name || "Workspace User"}</strong>
                {!shouldCollapseSidebar ? (
                  <>
                    <span>{session?.user.email}</span>
                    <span>{session?.user.role === "admin" ? "Admin" : "Member"}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <button 
            className="ghost-button sidebar-signout" 
            disabled
            type="button"
            aria-label="Sign out"
            title="Sign out is managed by Jira"
          >
            <LogoutIcon />
            {shouldCollapseSidebar ? null : <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {isMobileViewport ? (
        <button
          aria-hidden={!isMobileSidebarOpen}
          className={isMobileSidebarOpen ? "sidebar-backdrop is-visible" : "sidebar-backdrop"}
          onClick={() => setIsMobileSidebarOpen(false)}
          tabIndex={isMobileSidebarOpen ? 0 : -1}
          type="button"
        />
      ) : null}

      <main
        className={`workspace-main main${isWorkspaceWideLibrary ? " main--library-fill" : ""}`}
        data-route={location.pathname}
        data-section={currentSection}
      >
        {isMobileViewport ? (
          <div className="mobile-sidebar-bar">
            <button
              aria-controls="app-sidebar"
              aria-expanded={isMobileSidebarOpen}
              className="mobile-sidebar-toggle ghost-button"
              onClick={() => setIsMobileSidebarOpen(true)}
              type="button"
            >
              <MenuIcon />
              <span>Navigation</span>
            </button>
          </div>
        ) : null}
        {featureFlagsQuery.isPending && currentFeatureKeys.length ? (
          <LoadingState label="Loading project capabilities" />
        ) : canAccessCurrentRoute && canAccessCurrentFeature ? (
          <Outlet />
        ) : (
          <section className="permission-empty-state card">
            <span className="eyebrow">Access Limited</span>
            <h1>{canAccessCurrentRoute ? "This workspace feature is disabled." : "You do not have permission to view this workspace area."}</h1>
            <p>{canAccessCurrentRoute ? "Ask a Jira administrator to enable this project capability through the deployment-managed feature flag setup, or choose another available sidebar item." : "Ask an administrator to update your role permissions, or choose another available menu item from the sidebar."}</p>
          </section>
        )}
      </main>
    </div>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="20">{children}</svg>;
}

function DashboardIcon() {
  return <IconFrame><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></IconFrame>;
}

function UsersIcon() {
  return <IconFrame><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="3.5" /><path d="M20 8.5a3 3 0 0 1 0 5.8" /><path d="M23 21v-2a4 4 0 0 0-3-3.85" /></IconFrame>;
}

function UserIcon() {
  return <IconFrame><path d="M4 21v-1.6A4.4 4.4 0 0 1 8.4 15h7.2A4.4 4.4 0 0 1 20 19.4V21" /><circle cx="12" cy="8.2" r="3.6" /></IconFrame>;
}

function FolderIcon() {
  return <IconFrame><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v9A2.5 2.5 0 0 1 18.5 21h-13A2.5 2.5 0 0 1 3 18.5z" /><path d="M9 12v5" /><path d="M13 14v3" /></IconFrame>;
}

function ProjectScopeIcon() {
  return (
    <IconFrame>
      <rect height="4.5" rx="1" width="4.5" x="4.5" y="5" />
      <rect height="4.5" rx="1" width="4.5" x="15" y="14.5" />
      <path d="M9 7.25h3.25a2.5 2.5 0 0 1 2.5 2.5v4.75" />
      <path d="M7 9.5v4a3 3 0 0 0 3 3h5" />
    </IconFrame>
  );
}

function ServerIcon() {
  return <IconFrame><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><path d="M8 7h.01" /><path d="M8 17h.01" /><path d="M16 7h2" /><path d="M16 17h2" /></IconFrame>;
}

function ChevronIcon() {
  return <IconFrame><path d="m8 10 4 4 4-4" /></IconFrame>;
}

function PlugIcon() {
  return <IconFrame><path d="M8 7v5" /><path d="M16 7v5" /><path d="M7 12h10" /><path d="M12 12v5a3 3 0 0 1-3 3H8" /><path d="M16 20h-1" /></IconFrame>;
}

function FlaskIcon() {
  return <IconFrame><path d="M10 3v5l-5.5 9a2 2 0 0 0 1.73 3h11.54A2 2 0 0 0 19.5 17L14 8V3" /><path d="M8 3h8" /><path d="M8.5 14h7" /></IconFrame>;
}

function DocumentIcon() {
  return <IconFrame><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v6h6" /><path d="M9 13h6" /><path d="M9 17h6" /></IconFrame>;
}

function OpenBookIcon() {
  return (
    <IconFrame>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 1 4 16.5z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13a2 2 0 0 0-2 2v16a2 2 0 0 1 2-2h4.5a2.5 2.5 0 0 0 2.5-2.5z" />
      <path d="M8 7h2" />
      <path d="M15 7h2" />
      <path d="M8 11h2" />
      <path d="M15 11h2" />
    </IconFrame>
  );
}

function PencilIcon() {
  return <IconFrame><path d="M4 20l4.5-1 9-9-3.5-3.5-9 9z" /><path d="M13.5 6.5l3.5 3.5" /></IconFrame>;
}

function LayersIcon() {
  return <IconFrame><path d="m12 4 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4" /><path d="m4 16 8 4 8-4" /></IconFrame>;
}

function SharedStepsIcon() {
  return <IconFrame><circle cx="7" cy="8" r="2.5" /><circle cx="17" cy="8" r="2.5" /><circle cx="12" cy="17" r="2.5" /><path d="m9.2 9.4 2 5.2" /><path d="m14.8 9.4-2 5.2" /><path d="M9.5 8h5" /></IconFrame>;
}

function getWorkspaceSubItemIcon(icon?: string) {
  switch (icon) {
    case "analytics":
      return ActivityIcon;
    case "dashboard":
      return DashboardIcon;
    case "requirements":
      return DocumentIcon;
    case "cases":
      return PencilIcon;
    case "shared":
      return SharedStepsIcon;
    case "suites":
      return LayersIcon;
    case "executions":
      return RunIcon;
    case "automation":
      return AutomationIcon;
    case "repository":
      return LayersIcon;
    case "playwright":
      return PlayIcon;
    case "ops":
      return ActivityIcon;
    case "telemetry":
      return SlidersIcon;
    case "traces":
      return SharedStepsIcon;
    case "environments":
      return ServerIcon;
    case "data":
      return DatabaseIcon;
    case "configurations":
      return SlidersIcon;
    default:
      return SubmenuDotIcon;
  }
}

function SubmenuDotIcon() {
  return <IconFrame><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /></IconFrame>;
}

function PlayIcon() {
  return <IconFrame><path d="m7 4 12 8-12 8z" /></IconFrame>;
}

function RunIcon() {
  return <IconFrame><circle cx="12" cy="12" r="8" /><path d="m10 8 6 4-6 4z" /></IconFrame>;
}

function ActivityIcon() {
  return <IconFrame><path d="M4 12h3l2-6 4 12 2-6h5" /></IconFrame>;
}

function WorkflowIcon() {
  return (
    <IconFrame>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.3 8.5 11 15.7" />
      <path d="M15.7 8.5 13 15.7" />
      <path d="M8.5 7h7" />
    </IconFrame>
  );
}

function AutomationIcon() {
  return (
    <IconFrame>
      <rect x="6" y="8" width="12" height="10" rx="2.5" />
      <path d="M12 8V5" />
      <path d="M9 5h6" />
      <path d="M9.5 13h.01" />
      <path d="M14.5 13h.01" />
      <path d="M10 16h4" />
      <path d="M4 12h2" />
      <path d="M18 12h2" />
    </IconFrame>
  );
}

function LogoutIcon() {
  return <IconFrame><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></IconFrame>;
}

function BugIcon() {
  return (
    <IconFrame>
      <path d="M8 7.5V7a4 4 0 0 1 8 0v.5" />
      <rect x="7" y="7.5" width="10" height="12" rx="5" />
      <path d="M12 11v8" />
      <path d="m8.5 4-2-2" />
      <path d="m15.5 4 2-2" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
      <path d="m5 17 2.4-1.2" />
      <path d="m18.6 15.8 2.4 1.2" />
      <path d="m5 7.5 2.3 1.2" />
      <path d="m16.7 8.7 2.3-1.2" />
    </IconFrame>
  );
}

function BellIcon() {
  return <IconFrame><path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V11a5 5 0 0 1 10 0v3.2a2 2 0 0 0 .6 1.4L19 17h-4" /><path d="M10 20a2 2 0 0 0 4 0" /></IconFrame>;
}

function CogIcon() {
  return <IconFrame><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6" /></IconFrame>;
}

function DatabaseIcon() {
  return <IconFrame><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" /><path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" /></IconFrame>;
}

function SlidersIcon() {
  return <IconFrame><path d="M4 6h6" /><path d="M14 6h6" /><path d="M10 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" /><path d="M4 12h10" /><path d="M18 12h2" /><path d="M14 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" /><path d="M4 18h3" /><path d="M11 18h9" /><path d="M7 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" /></IconFrame>;
}

function SupportIcon() {
  return <IconFrame><path d="M9.1 9a3 3 0 1 1 5.8 1c-.5 1.2-1.6 1.7-2.4 2.3-.6.5-1 1-1 1.7" /><circle cx="12" cy="18" r="1" /><path d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></IconFrame>;
}

function MenuIcon() {
  return <IconFrame><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></IconFrame>;
}

function CloseIcon() {
  return <IconFrame><path d="m6 6 12 12" /><path d="M18 6 6 18" /></IconFrame>;
}

function SunIcon() {
  return <IconFrame><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5" /><path d="M12 19v2.5" /><path d="m4.93 4.93 1.77 1.77" /><path d="m17.3 17.3 1.77 1.77" /><path d="M2.5 12H5" /><path d="M19 12h2.5" /><path d="m4.93 19.07 1.77-1.77" /><path d="m17.3 6.7 1.77-1.77" /></IconFrame>;
}

function MoonIcon() {
  return <IconFrame><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.8 6.8 0 0 0 20 14.5z" /></IconFrame>;
}
