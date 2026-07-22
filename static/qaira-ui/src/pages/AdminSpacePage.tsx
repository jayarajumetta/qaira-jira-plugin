import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ActivityIcon, LayersIcon, PlugIcon, UsersIcon } from "../components/AppIcons";
import { useAuth } from "../auth/AuthContext";
import { AppErrorState } from "../components/AppErrorBoundary";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { SubnavTabs } from "../components/SubnavTabs";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useCurrentProject } from "../hooks/useCurrentProject";
import { api } from "../lib/api";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { hasPermission } from "../lib/permissions";
import { queryKeys } from "../lib/queryKeys";
import { IntegrationsPage } from "./IntegrationsPage";
import { PeoplePage } from "./PeoplePage";
import { SettingsPage } from "./SettingsPage";
import type { AdminHealthCheck, AdminHealthSnapshot, AdminHealthStatus } from "../types";

type AdminSpaceSection = "health" | "users" | "roles" | "integrations" | "settings";

const ADMIN_SECTIONS: AdminSpaceSection[] = ["health", "users", "roles", "integrations", "settings"];
const ADMIN_SECTION_FEATURES: Record<AdminSpaceSection, string[]> = {
  health: ["qaira.ops.admin"],
  users: ["qaira.ops.admin"],
  roles: ["qaira.ops.admin"],
  integrations: ["qaira.api.integrations"],
  settings: []
};

const normalizeSection = (value: string | null): AdminSpaceSection | null =>
  ADMIN_SECTIONS.includes(value as AdminSpaceSection) ? (value as AdminSpaceSection) : null;

const HEALTH_SECTION_LABELS = {
  registry: "Project registry",
  schema: "Jira schema",
  storage: "Storage",
  attachments: "Attachments",
  permissions: "Permissions"
} as const;

const normalizeHealthStatus = (value: unknown): AdminHealthStatus => {
  const status = String(value || "").toLowerCase();
  if (["ready", "healthy", "ok", "passed", "pass"].includes(status)) return "ready";
  if (["blocked", "failed", "error", "critical"].includes(status)) return "blocked";
  return "degraded";
};

const healthStatusLabel = (status: AdminHealthStatus) =>
  status === "ready" ? "Ready" : status === "blocked" ? "Blocked" : "Degraded";

const healthStatusClass = (status: AdminHealthStatus) =>
  status === "ready" ? "completed" : status === "blocked" ? "failed" : "running";

function collectHealthChecks(snapshot: AdminHealthSnapshot): AdminHealthCheck[] {
  if (snapshot.checks?.length) {
    return snapshot.checks.map((check) => ({ ...check, status: normalizeHealthStatus(check.status) }));
  }

  return (Object.keys(HEALTH_SECTION_LABELS) as Array<keyof typeof HEALTH_SECTION_LABELS>).flatMap((key) => {
    const section = snapshot[key];
    return section ? [{ key, label: HEALTH_SECTION_LABELS[key], ...section, status: normalizeHealthStatus(section.status) }] : [];
  });
}

export function AdminSpacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projectId] = useCurrentProject();
  const { session } = useAuth();
  const usersQuery = useQuery({ queryKey: queryKeys.users(), queryFn: api.users.list });
  const rolesQuery = useQuery({ queryKey: queryKeys.roles(), queryFn: api.roles.list });
  const integrationsQuery = useQuery({ queryKey: queryKeys.integrations.scoped("admin-space"), queryFn: () => api.integrations.list() });
  const featureFlagsQuery = useFeatureFlags();
  const canViewSystemHealth = hasPermission(session, "ops.view");
  const isSystemHealthEnabled = featureFlagsQuery.isSuccess
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ADMIN_SECTION_FEATURES.health);
  const healthQuery = useQuery({
    queryKey: ["admin-health", projectId],
    queryFn: async () => {
      const snapshot = await api.admin.health({ project_id: projectId || undefined });
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !snapshot.status) {
        throw new Error("The installed backend does not expose a valid admin health report yet.");
      }
      return { ...snapshot, status: normalizeHealthStatus(snapshot.status) };
    },
    enabled: canViewSystemHealth && isSystemHealthEnabled,
    retry: 1,
    staleTime: 30_000
  });

  const requestedSection = normalizeSection(searchParams.get("section")) || (searchParams.get("view") === "roles" ? "roles" : "users");
  const visibleSections = ADMIN_SECTIONS.filter((section) => {
    if (section === "health" && !canViewSystemHealth) return false;
    return areFeatureFlagsEnabled(featureFlagsQuery.data, ADMIN_SECTION_FEATURES[section]);
  });
  const activeSection = visibleSections.includes(requestedSection) ? requestedSection : "settings";
  const users = usersQuery.data || [];
  const roles = rolesQuery.data || [];
  const integrations = integrationsQuery.data || [];
  const activeIntegrations = integrations.filter((integration) => integration.is_active).length;
  const adminUsers = users.filter((user) => user.role === "admin").length;
  const healthChecks = healthQuery.data ? collectHealthChecks(healthQuery.data) : [];
  const readyHealthChecks = healthChecks.filter((check) => check.status === "ready").length;

  const sectionMeta = useMemo(() => {
    switch (activeSection) {
      case "health":
        return {
          title: "System Health",
          eyebrow: "Operational readiness",
          description: "Verify Jira schema, registry, storage, attachment, and permission readiness from live checks.",
          detail: healthQuery.data ? healthStatusLabel(healthQuery.data.status) : healthQuery.isLoading ? "Checking" : "Unavailable"
        };
      case "roles":
        return {
          title: "Roles",
          eyebrow: "Access model",
          description: "Tune role definitions and permission bundles without leaving the administration workspace.",
          detail: `${roles.length} role${roles.length === 1 ? "" : "s"} available`
        };
      case "integrations":
        return {
          title: "Integrations",
          eyebrow: "Connected systems",
          description: "Manage external systems, engines, AI providers, authentication, and delivery connections.",
          detail: `${activeIntegrations}/${integrations.length} active`
        };
      case "settings":
        return {
          title: "Settings",
          eyebrow: "Workspace defaults",
          description: "Set workspace preferences, sidebar behavior, theme defaults, and localization controls.",
          detail: "Theme, sidebar, exports, localization"
        };
      case "users":
      default:
        return {
          title: "Users",
          eyebrow: "Directory",
          description: "Manage workspace users, access assignments, connected systems, and workspace settings from one place.",
          detail: `${adminUsers} admin${adminUsers === 1 ? "" : "s"}`
        };
    }
  }, [activeIntegrations, activeSection, adminUsers, healthQuery.data, healthQuery.isLoading, integrations.length, roles.length]);

  const overviewItems = [
    {
      section: "health" as const,
      label: "System Health",
      value: healthQuery.data ? healthStatusLabel(healthQuery.data.status) : "Check",
      detail: healthQuery.data ? `${readyHealthChecks}/${healthChecks.length} checks ready` : "Live diagnostics",
      icon: <ActivityIcon />
    },
    {
      section: "users" as const,
      label: "Users",
      value: users.length,
      detail: `${adminUsers} admin${adminUsers === 1 ? "" : "s"}`,
      icon: <UsersIcon />
    },
    {
      section: "roles" as const,
      label: "Roles",
      value: roles.length,
      detail: "Permission bundles",
      icon: <LayersIcon />
    },
    {
      section: "integrations" as const,
      label: "Integrations",
      value: integrations.length,
      detail: `${activeIntegrations} active`,
      icon: <PlugIcon />
    },
    {
      section: "settings" as const,
      label: "Settings",
      value: "Workspace",
      detail: "Preferences",
      icon: <ActivityIcon />
    }
  ].filter((item) => visibleSections.includes(item.section));
  const adminTabItems: Array<{ value: AdminSpaceSection; label: string; meta: string; icon: ReactNode }> = [
    { value: "health", label: "System Health", meta: healthQuery.data ? healthStatusLabel(healthQuery.data.status) : "Diagnostics", icon: <ActivityIcon /> },
    { value: "users", label: "Users", meta: `${users.length} records`, icon: <UsersIcon /> },
    { value: "roles", label: "Roles", meta: `${roles.length} records`, icon: <LayersIcon /> },
    { value: "integrations", label: "Integrations", meta: `${integrations.length} configured`, icon: <PlugIcon /> },
    { value: "settings", label: "Settings", meta: "Workspace", icon: <ActivityIcon /> }
  ];
  const visibleAdminTabItems = adminTabItems.filter((item) => visibleSections.includes(item.value));

  const handleSectionChange = (section: AdminSpaceSection) => {
    const nextParams = new URLSearchParams();
    nextParams.set("section", section);
    setSearchParams(nextParams, { replace: false });
  };

  return (
    <div className="page-content admin-space-page">
      <PageHeader
        eyebrow="Administration"
        title="Admin Space"
        description="Manage users, access roles, connected systems, and workspace preferences from one administration surface."
      />

      <section className="admin-space-overview" aria-label="Admin Space overview">
        <div className="admin-space-overview-copy">
          <p className="eyebrow">{sectionMeta.eyebrow}</p>
          <strong>{sectionMeta.title}</strong>
          <span>{sectionMeta.detail}</span>
          <p>{sectionMeta.description}</p>
        </div>
        <div className="admin-space-metrics metric-strip page-metric-strip" aria-label="Administration sections" role="group">
          {overviewItems.map((item) => (
            <button
              className={activeSection === item.section ? "admin-space-metric is-active" : "admin-space-metric"}
              key={item.section}
              onClick={() => handleSectionChange(item.section)}
              type="button"
            >
              <span className="admin-space-metric-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <SubnavTabs
        ariaLabel="Admin Space sections"
        className="admin-space-tabs"
        items={visibleAdminTabItems}
        onChange={handleSectionChange}
        showIndicator={false}
        value={activeSection}
      />

      <section className="admin-space-section" aria-label={`${activeSection} section`}>
        {activeSection === "health" ? (
          healthQuery.isLoading ? (
            <Panel title="System health" subtitle="Checking the live Forge and Jira configuration.">
              <div className="empty-state compact" role="status">Running system checks…</div>
            </Panel>
          ) : healthQuery.error ? (
            <AppErrorState
              compact
              error={healthQuery.error}
              fallbackMessage="Qaira could not load system health. Confirm the backend is deployed, then retry."
              onRetry={() => void healthQuery.refetch()}
              title="System health unavailable"
            />
          ) : healthQuery.data ? (
            <Panel
              actions={(
                <button className="ghost-button compact" disabled={healthQuery.isFetching} onClick={() => void healthQuery.refetch()} type="button">
                  {healthQuery.isFetching ? "Checking…" : "Run checks again"}
                </button>
              )}
              subtitle="Live readiness checks from the deployed Forge backend."
              title="System health"
            >
              <div className="metric-strip compact">
                <div className="mini-card">
                  <strong>{healthStatusLabel(healthQuery.data.status)}</strong>
                  <span>Overall status</span>
                </div>
                <div className="mini-card">
                  <strong>{readyHealthChecks}/{healthChecks.length}</strong>
                  <span>Checks ready</span>
                </div>
                <div className="mini-card">
                  <strong>{healthQuery.data.version || "Current"}</strong>
                  <span>App version</span>
                </div>
                <div className="mini-card">
                  <strong>{healthQuery.data.checked_at ? new Date(healthQuery.data.checked_at).toLocaleTimeString() : "Now"}</strong>
                  <span>Last checked</span>
                </div>
              </div>
              {healthChecks.length ? (
                <div className="stack-list">
                  {healthChecks.map((check) => (
                    <div className="stack-item" key={check.key}>
                      <div>
                        <strong>{check.label}</strong>
                        <span>{check.summary || check.detail || "No diagnostic detail was returned."}</span>
                        {check.remediation ? <small>{check.remediation}</small> : null}
                      </div>
                      <span className={`status-badge ${healthStatusClass(check.status)}`}>{healthStatusLabel(check.status)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <AppErrorState
                  compact
                  fallbackMessage="The health endpoint returned no registry, schema, storage, attachment, or permission checks."
                  onRetry={() => void healthQuery.refetch()}
                  title="No health checks returned"
                />
              )}
            </Panel>
          ) : null
        ) : null}
        {activeSection === "users" ? <PeoplePage embedded forcedView="users" /> : null}
        {activeSection === "roles" ? <PeoplePage embedded forcedView="roles" /> : null}
        {activeSection === "integrations" ? <IntegrationsPage embedded /> : null}
        {activeSection === "settings" ? <SettingsPage embedded /> : null}
      </section>
    </div>
  );
}
