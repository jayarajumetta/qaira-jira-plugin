import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useLocalization } from "../context/LocalizationContext";
import { AddIcon, CopyIcon, SaveIcon, TrashIcon } from "../components/AppIcons";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { ToastMessage } from "../components/ToastMessage";
import { api } from "../lib/api";
import {
  AI_PROMPT_LLM_OVERRIDES_KEY,
  AI_PROMPT_OVERRIDES_KEY,
  AI_PROMPT_REGISTRY,
  normalizeAiPromptLlmOverrides,
  normalizeAiPromptOverrides,
  resolveAiPromptRegistryValue
} from "../lib/aiPromptRegistry";
import { DEFAULT_LOCALIZATION_STRINGS } from "../lib/localization";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { hasPermission } from "../lib/permissions";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  readNotificationPreferences,
  writeNotificationPreferences,
  type NotificationPreferences
} from "../lib/notificationPreferences";
import { queryKeys } from "../lib/queryKeys";
import type { ApiKeyScope, ApiKeyScopeOption, Integration, UserApiKey } from "../types";
import { readDefaultCatalogViewMode, writeDefaultCatalogViewMode, type CatalogViewModePreference } from "../lib/viewPreferences";
import {
  PREFERENCES_UPDATED_EVENT,
  emitWorkspacePreferenceUpdate,
  preferenceStorageKeys,
  readSidebarMode,
  readWorkspaceTheme,
  writeSidebarMode,
  type SidebarMode,
  type WorkspaceTheme
} from "../lib/workspacePreferences";

const DEFAULT_API_KEY_SCOPE_OPTIONS: ApiKeyScopeOption[] = [
  { value: "user", label: "User access", description: "Default. Uses your current user permissions." },
  { value: "read", label: "Read only", description: "GET and HEAD requests only." },
  { value: "design", label: "Design", description: "Requirements, test cases, suites, steps, and data." },
  { value: "automation", label: "Automation", description: "Automation build, object repository, recorder, and workflows." },
  { value: "runs", label: "Runs", description: "Executions, results, schedules, reports, and bugs." },
  { value: "environment", label: "Environment", description: "Environments, configurations, app types, and data sets." },
  { value: "integrations", label: "Integrations", description: "Integrations, AI knowledge, and prompt templates." },
  { value: "admin", label: "Admin", description: "Full API access, limited by your user permissions." }
];

type ProjectAutomationSettings = {
  waitTimeMs: string;
  failureRetries: string;
  videoMode: "off" | "on" | "retain-on-failure";
  screenshotMode: "off" | "on" | "only-on-failure";
  defaultLlmIntegrationId: string;
  localEngineBaseUrl: string;
  remoteGridProvider: "default" | "browserstack" | "lambdatest" | "saucelabs" | "crossbrowser";
};

const DEFAULT_PROJECT_AUTOMATION_SETTINGS: ProjectAutomationSettings = {
  waitTimeMs: "750",
  failureRetries: "2",
  videoMode: "retain-on-failure",
  screenshotMode: "only-on-failure",
  defaultLlmIntegrationId: "",
  localEngineBaseUrl: "http://localhost:4311",
  remoteGridProvider: "default"
};

type SettingsSectionId =
  | "general"
  | "apiKeys"
  | "automationDefaults"
  | "aiPromptMapping"
  | "exportRetention"
  | "notifications"
  | "localization";

const DEFAULT_EXPANDED_SETTINGS_SECTIONS: Record<SettingsSectionId, boolean> = {
  general: true,
  apiKeys: false,
  automationDefaults: false,
  aiPromptMapping: false,
  exportRetention: false,
  notifications: true,
  localization: false
};

function readProjectAutomationSettings(): ProjectAutomationSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(preferenceStorageKeys.projectAutomationSettings) || "{}") as Partial<ProjectAutomationSettings>;
    return { ...DEFAULT_PROJECT_AUTOMATION_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_PROJECT_AUTOMATION_SETTINGS;
  }
}

export function SettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useAuth();
  const { strings, setWorkspaceStrings, t } = useLocalization();
  const [theme, setTheme] = useState<WorkspaceTheme>("light");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("collapsed");
  const [defaultCatalogViewMode, setDefaultCatalogViewMode] = useState<CatalogViewModePreference>("tile");
  const [autoExport, setAutoExport] = useState(false);
  const [projectAutomationSettings, setProjectAutomationSettings] = useState<ProjectAutomationSettings>(DEFAULT_PROJECT_AUTOMATION_SETTINGS);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(AI_PROMPT_REGISTRY.map((prompt) => [prompt.key, prompt.value]))
  );
  const [promptLlmDrafts, setPromptLlmDrafts] = useState<Record<string, string>>({});
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyScope, setApiKeyScope] = useState<ApiKeyScope>("user");
  const [createdApiKey, setCreatedApiKey] = useState("");
  const [createdApiKeyRecord, setCreatedApiKeyRecord] = useState<UserApiKey | null>(null);
  const [isCreatingApiKey, setIsCreatingApiKey] = useState(false);
  const [revokingApiKeyId, setRevokingApiKeyId] = useState("");
  const [deletingApiKeyId, setDeletingApiKeyId] = useState("");
  const [expandedSettingsSections, setExpandedSettingsSections] = useState<Record<SettingsSectionId, boolean>>(DEFAULT_EXPANDED_SETTINGS_SECTIONS);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingLocalization, setIsSavingLocalization] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isAdmin = session?.user.role === "admin";
  const canViewAdminSettings = isAdmin;
  const canManageApiKeys = isAdmin && hasPermission(session, "api_key.manage");
  const canManageAiPrompts = isAdmin && hasPermission(session, "ai_prompt.manage");
  const canManageLocalization = isAdmin && hasPermission(session, "localization.manage");
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const canUseAutomationWorkspace = areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace"]);
  const integrationsQuery = useQuery({ queryKey: queryKeys.integrations.all(), queryFn: () => api.integrations.list(), enabled: Boolean(session && canViewAdminSettings) });
  const workspacePreferencesQuery = useQuery({
    queryKey: queryKeys.settings.workspacePreferences(),
    queryFn: api.settings.getWorkspacePreferences,
    enabled: Boolean(session)
  });
  const apiKeysQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys(),
    queryFn: api.settings.listApiKeys,
    enabled: Boolean(session && canManageApiKeys)
  });
  const llmIntegrations = useMemo(
    () => (integrationsQuery.data || []).filter((integration: Integration) => integration.type === "llm" && integration.is_active),
    [integrationsQuery.data]
  );
  const apiKeyScopeOptions = useMemo(
    () => (apiKeysQuery.data?.scopes?.length ? apiKeysQuery.data.scopes : DEFAULT_API_KEY_SCOPE_OPTIONS)
      .filter((scope) => canUseAutomationWorkspace || scope.value !== "automation"),
    [apiKeysQuery.data, canUseAutomationWorkspace]
  );
  const visibleAiPromptRegistry = useMemo(
    () => AI_PROMPT_REGISTRY.filter((prompt) => canUseAutomationWorkspace || !prompt.key.startsWith("ai.automation.")),
    [canUseAutomationWorkspace]
  );
  const apiKeyScopeLabels = useMemo(
    () => Object.fromEntries(apiKeyScopeOptions.map((scope) => [scope.value, scope.label])) as Record<ApiKeyScope, string>,
    [apiKeyScopeOptions]
  );

  useEffect(() => {
    setTheme(readWorkspaceTheme());
    setSidebarMode(readSidebarMode());
    setDefaultCatalogViewMode(readDefaultCatalogViewMode());
    setAutoExport(window.localStorage.getItem(preferenceStorageKeys.autoExport) === "true");
    setProjectAutomationSettings(readProjectAutomationSettings());
    setNotificationPreferences(readNotificationPreferences());
  }, []);

  useEffect(() => {
    const syncJiraTheme = () => setTheme(readWorkspaceTheme());
    window.addEventListener(PREFERENCES_UPDATED_EVENT, syncJiraTheme);
    return () => window.removeEventListener(PREFERENCES_UPDATED_EVENT, syncJiraTheme);
  }, []);

  useEffect(() => {
    const overrides = normalizeAiPromptOverrides(workspacePreferencesQuery.data?.preferences?.[AI_PROMPT_OVERRIDES_KEY]);
    const llmOverrides = normalizeAiPromptLlmOverrides(workspacePreferencesQuery.data?.preferences?.[AI_PROMPT_LLM_OVERRIDES_KEY]);
    setPromptDrafts(
      Object.fromEntries(
        AI_PROMPT_REGISTRY.map((prompt) => [
          prompt.key,
          resolveAiPromptRegistryValue(prompt.key, overrides)
        ])
      )
    );
    setPromptLlmDrafts(
      Object.fromEntries(
        AI_PROMPT_REGISTRY.map((prompt) => [prompt.key, llmOverrides[prompt.key] || ""])
      )
    );
  }, [workspacePreferencesQuery.data]);

  const saveSettings = async () => {
    setIsSavingSettings(true);

    try {
      writeSidebarMode(sidebarMode);
      window.localStorage.setItem(preferenceStorageKeys.autoExport, String(autoExport));
      window.localStorage.setItem(preferenceStorageKeys.projectAutomationSettings, JSON.stringify(projectAutomationSettings));
      writeDefaultCatalogViewMode(defaultCatalogViewMode);
      writeNotificationPreferences(notificationPreferences);
      const preferencesToSave = canManageAiPrompts
        ? {
          [AI_PROMPT_OVERRIDES_KEY]: Object.fromEntries(
            AI_PROMPT_REGISTRY.map((prompt) => [prompt.key, promptDrafts[prompt.key] ?? prompt.value])
          ),
          [AI_PROMPT_LLM_OVERRIDES_KEY]: Object.fromEntries(
            AI_PROMPT_REGISTRY
              .map((prompt) => [prompt.key, promptLlmDrafts[prompt.key] || ""])
              .filter(([, integrationId]) => Boolean(integrationId))
          )
        }
        : {};

      await api.settings.updateWorkspacePreferences({ preferences: preferencesToSave });
      await workspacePreferencesQuery.refetch();
      emitWorkspacePreferenceUpdate({ sidebarMode });
      setMessageTone("success");
      setMessage("Settings changes saved.");
    } catch (error) {
      showError(error, "Unable to save settings changes.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const updateProjectAutomationSetting = <Key extends keyof ProjectAutomationSettings>(
    key: Key,
    value: ProjectAutomationSettings[Key]
  ) => {
    setProjectAutomationSettings((current) => ({
      ...current,
      [key]: value
    }));
  };

  const showError = (error: unknown, fallback: string) => {
    setMessageTone("error");
    setMessage(error instanceof Error ? error.message : fallback);
  };

  const handleDownloadLocalization = () => {
    const blob = new Blob([JSON.stringify(strings, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "qaira-localization.json";
    link.click();
    URL.revokeObjectURL(href);
  };

  const persistLocalization = async (nextStrings: Record<string, string>, successMessage: string) => {
    if (!canManageLocalization) {
      showError(new Error("Permission required: localization.manage"), "Unable to save localization strings.");
      return;
    }

    setIsSavingLocalization(true);

    try {
      const response = await api.settings.updateLocalization({ strings: nextStrings });
      setWorkspaceStrings(response.strings);
      setMessageTone("success");
      setMessage(successMessage);
    } catch (error) {
      showError(error, "Unable to save localization strings.");
    } finally {
      setIsSavingLocalization(false);
    }
  };

  const handleUploadLocalization = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as Record<string, string>;

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Localization file must be a JSON object.");
      }

      await persistLocalization(parsed, "Localization strings updated.");
    } catch (error) {
      showError(error, "Unable to upload localization strings.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const formatApiDate = (value?: string | null) => {
    if (!value) {
      return "Never";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setMessageTone("success");
      setMessage(successMessage);
    } catch (error) {
      showError(error, "Unable to copy to clipboard.");
    }
  };

  const handleCreateApiKey = async () => {
    if (!canManageApiKeys) {
      setMessageTone("error");
      setMessage("Permission required: api_key.manage");
      return;
    }

    if (apiKeyName.trim().length < 2) {
      setMessageTone("error");
      setMessage("Enter an API key name with at least 2 characters.");
      return;
    }

    setIsCreatingApiKey(true);

    try {
      const response = await api.settings.createApiKey({
        name: apiKeyName.trim(),
        scope: apiKeyScope
      });
      setCreatedApiKey(response.key);
      setCreatedApiKeyRecord(response.api_key);
      setApiKeyName("");
      setApiKeyScope("user");
      await apiKeysQuery.refetch();
      setMessageTone("success");
      setMessage("API key created. Copy it now; it will not be shown again.");
    } catch (error) {
      showError(error, "Unable to create API key.");
    } finally {
      setIsCreatingApiKey(false);
    }
  };

  const handleRevokeApiKey = async (apiKeyRecord: UserApiKey) => {
    if (!canManageApiKeys) {
      setMessageTone("error");
      setMessage("Permission required: api_key.manage");
      return;
    }

    if (!apiKeyRecord.is_active || !window.confirm(`Revoke API key "${apiKeyRecord.name}"?`)) {
      return;
    }

    setRevokingApiKeyId(apiKeyRecord.id);

    try {
      await api.settings.revokeApiKey(apiKeyRecord.id);
      if (createdApiKeyRecord?.id === apiKeyRecord.id) {
        setCreatedApiKey("");
        setCreatedApiKeyRecord(null);
      }
      await apiKeysQuery.refetch();
      setMessageTone("success");
      setMessage("API key revoked.");
    } catch (error) {
      showError(error, "Unable to revoke API key.");
    } finally {
      setRevokingApiKeyId("");
    }
  };

  const handleDeleteApiKey = async (apiKeyRecord: UserApiKey) => {
    if (!canManageApiKeys) {
      setMessage("You do not have permission to manage API keys.");
      setMessageTone("error");
      return;
    }

    if (!window.confirm(`Delete API key "${apiKeyRecord.name}" from this list? This cannot be undone.`)) {
      return;
    }

    setDeletingApiKeyId(apiKeyRecord.id);
    setMessage("");
    try {
      await api.settings.deleteApiKey(apiKeyRecord.id);
      if (createdApiKeyRecord?.id === apiKeyRecord.id) {
        setCreatedApiKey("");
        setCreatedApiKeyRecord(null);
      }
      await apiKeysQuery.refetch();
      setMessageTone("success");
      setMessage("API key deleted.");
    } catch (error) {
      showError(error, "Unable to delete API key.");
    } finally {
      setDeletingApiKeyId("");
    }
  };

  const toggleSettingsSection = (section: SettingsSectionId) => {
    setExpandedSettingsSections((current) => ({
      ...current,
      [section]: !current[section]
    }));
  };

  const settingsActions = (
    <button
      className="primary-button"
      disabled={isSavingSettings || isSavingLocalization}
      onClick={() => void saveSettings()}
      type="button"
    >
      <SaveIcon />
      {isSavingSettings ? "Saving..." : "Save changes"}
    </button>
  );

  const renderSettingsSection = (
    section: SettingsSectionId,
    eyebrow: string,
    title: string,
    children: ReactNode,
    options: { actions?: ReactNode; adminOnly?: boolean } = {}
  ) => {
    if (options.adminOnly && !canViewAdminSettings) {
      return null;
    }

    const isExpanded = expandedSettingsSections[section];

    return (
      <section className={isExpanded ? "settings-section is-expanded" : "settings-section is-collapsed"} key={section}>
        <div className="settings-section-heading settings-section-heading--with-action">
          <button
            aria-expanded={isExpanded}
            className="settings-section-toggle"
            onClick={() => toggleSettingsSection(section)}
            type="button"
          >
            <span>
              <span className="eyebrow">{eyebrow}</span>
              <strong>{title}</strong>
            </span>
            <span aria-hidden="true" className="settings-section-toggle-icon">{isExpanded ? "-" : "+"}</span>
          </button>
          {options.actions ? <div className="settings-section-actions">{options.actions}</div> : null}
        </div>
        {isExpanded ? children : null}
      </section>
    );
  };

  return (
    <div className={embedded ? "admin-embedded-page settings-admin-page" : "page-content"}>
      {!embedded ? (
	        <PageHeader
          eyebrow="Settings"
          title="Workspace Settings"
          description="Save the interface defaults and behavior preferences you want to carry across sessions."
	          meta={[
	            { label: "Theme", value: theme === "light" ? "Light" : "Dark" },
	            { label: "Sidebar", value: sidebarMode === "collapsed" ? "Collapsed" : "Expanded" },
	            { label: "Catalogs", value: defaultCatalogViewMode === "tile" ? "Grid" : "List" },
	            { label: "Export prompts", value: autoExport ? "Enabled" : "Off" }
	          ]}
	          actions={settingsActions}
	        />
	      ) : null}

      <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone} />

	      {embedded ? (
	        <div className="settings-top-save-bar">
	          <div>
	            <span className="eyebrow">Settings</span>
	            <strong>Workspace settings</strong>
	          </div>
	          {settingsActions}
	        </div>
	      ) : null}

	      <div className="settings-section-stack">
        {renderSettingsSection("general", "General", "Appearance and navigation", (
          <div className="two-column-grid">
            <Panel title="Appearance" subtitle="Qaira follows the theme selected in your Jira profile.">
              <div className="detail-stack">
                <div className="settings-native-preference">
                  <strong>{theme === "dark" ? t("settings.general.themeDark", "Dark theme") : t("settings.general.themeLight", "Light theme")}</strong>
                  <span>Managed by Jira appearance preferences and synchronized automatically.</span>
                </div>
                <label className="checkbox-field">
                  <input checked={sidebarMode === "expanded"} name="sidebar-preference" onChange={() => setSidebarMode("expanded")} type="radio" />
                  <span>{t("settings.general.sidebarExpanded", "Expanded sidebar by default")}</span>
                </label>
                <label className="checkbox-field">
                  <input checked={sidebarMode === "collapsed"} name="sidebar-preference" onChange={() => setSidebarMode("collapsed")} type="radio" />
                  <span>{t("settings.general.sidebarCollapsed", "Collapsed sidebar by default")}</span>
                </label>
              </div>
            </Panel>

            <Panel title="Catalog view preference" subtitle="Choose the default view used when catalog pages open.">
              <div className="detail-stack">
                <label className="checkbox-field">
                  <input checked={defaultCatalogViewMode === "tile"} name="catalog-view-preference" onChange={() => setDefaultCatalogViewMode("tile")} type="radio" />
                  <span>{t("settings.general.catalogGrid", "Open catalogs in grid view by default")}</span>
                </label>
                <label className="checkbox-field">
                  <input checked={defaultCatalogViewMode === "list"} name="catalog-view-preference" onChange={() => setDefaultCatalogViewMode("list")} type="radio" />
                  <span>{t("settings.general.catalogList", "Open catalogs in list view by default")}</span>
                </label>
              </div>
            </Panel>
          </div>
	        ))}

        {renderSettingsSection("apiKeys", "API", "API access keys", (
          <Panel title="Scoped API keys" subtitle="Create personal keys for API clients. A key can never exceed your current user permissions.">
            <div className="settings-api-create-grid">
              <label className="settings-input-field">
                <span>Key name</span>
                <input
                  onChange={(event) => setApiKeyName(event.target.value)}
                  placeholder="CI runner, local script, reporting job"
                  value={apiKeyName}
                />
                <small>Use a name that makes the client easy to audit later.</small>
              </label>
              <label className="settings-input-field">
                <span>Scope</span>
                <select
                  onChange={(event) => setApiKeyScope(event.target.value as ApiKeyScope)}
                  value={apiKeyScope}
                >
                  {apiKeyScopeOptions.map((scope) => (
                    <option key={scope.value} value={scope.value}>{scope.label}</option>
                  ))}
                </select>
                <small>{apiKeyScopeOptions.find((scope) => scope.value === apiKeyScope)?.description || "Scoped API access."}</small>
              </label>
              <button
                className="primary-button settings-api-create-button"
                disabled={isCreatingApiKey || apiKeyName.trim().length < 2}
                onClick={() => void handleCreateApiKey()}
                type="button"
              >
                <AddIcon />
                <span>{isCreatingApiKey ? "Creating..." : "Create API key"}</span>
              </button>
            </div>

            {createdApiKey ? (
              <div className="settings-api-key-reveal" role="status">
                <div>
                  <strong>{createdApiKeyRecord?.name || "New API key"}</strong>
                  <span>Copy this key now. It will not be shown again after you leave this screen.</span>
                </div>
                <code>{createdApiKey}</code>
                <button className="ghost-button compact" onClick={() => void copyToClipboard(createdApiKey, "API key copied.")} type="button">
                  <CopyIcon size={15} />
                  <span>Copy key</span>
                </button>
              </div>
            ) : null}

            <div className="settings-api-scope-grid" aria-label="API key scopes">
              {apiKeyScopeOptions.map((scope) => (
                <div className={scope.value === apiKeyScope ? "settings-api-scope-pill is-selected" : "settings-api-scope-pill"} key={scope.value}>
                  <strong>{scope.label}</strong>
                  <span>{scope.description}</span>
                </div>
              ))}
            </div>

            <div className="settings-api-key-list" aria-label="Created API keys">
              {apiKeysQuery.isLoading ? <LoadingState label="Loading API keys" /> : null}
              {!apiKeysQuery.isLoading && !(apiKeysQuery.data?.api_keys || []).length ? (
                <div className="empty-state compact">No API keys created yet.</div>
              ) : null}
              {(apiKeysQuery.data?.api_keys || []).map((apiKeyRecord) => (
                <article className={apiKeyRecord.is_active ? "settings-api-key-card" : "settings-api-key-card is-revoked"} key={apiKeyRecord.id}>
                  <div className="settings-api-key-main">
                    <strong>{apiKeyRecord.name}</strong>
                    <span>{apiKeyScopeLabels[apiKeyRecord.scope] || apiKeyRecord.scope}</span>
                  </div>
                  <code>{apiKeyRecord.key_prefix}</code>
                  <div className="settings-api-key-meta">
                    <span>{apiKeyRecord.is_active ? "Active" : "Revoked"}</span>
                    <span>Created {formatApiDate(apiKeyRecord.created_at)}</span>
                    <span>Last used {formatApiDate(apiKeyRecord.last_used_at)}</span>
                  </div>
                  <div className="settings-api-key-actions">
                    <button
                      className="ghost-button compact danger"
                      disabled={!apiKeyRecord.is_active || revokingApiKeyId === apiKeyRecord.id || deletingApiKeyId === apiKeyRecord.id}
                      onClick={() => void handleRevokeApiKey(apiKeyRecord)}
                      type="button"
                    >
                      <span>{revokingApiKeyId === apiKeyRecord.id ? "Revoking..." : "Revoke"}</span>
                    </button>
                    <button
                      aria-label={`Delete API key ${apiKeyRecord.name}`}
                      className="ghost-button compact danger icon-only-button"
                      disabled={deletingApiKeyId === apiKeyRecord.id}
                      onClick={() => void handleDeleteApiKey(apiKeyRecord)}
                      title="Delete API key"
                      type="button"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        ), { adminOnly: true })}

        {canUseAutomationWorkspace ? renderSettingsSection("automationDefaults", "Project settings", "Automation defaults", (
          <Panel title="Project automation settings" subtitle="Default behavior for generated automation, local runs, remote grid runs, and evidence capture.">
            <div className="settings-project-grid">
              <label className="settings-input-field">
                <span>Wait time after recovery</span>
                <input
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => updateProjectAutomationSetting("waitTimeMs", event.target.value)}
                  type="number"
                  value={projectAutomationSettings.waitTimeMs}
                />
                <small>Milliseconds before retrying a healed action.</small>
              </label>
              <label className="settings-input-field">
                <span>Failure retries</span>
                <input
                  inputMode="numeric"
                  min="0"
                  max="10"
                  onChange={(event) => updateProjectAutomationSetting("failureRetries", event.target.value)}
                  type="number"
                  value={projectAutomationSettings.failureRetries}
                />
                <small>Retry count for flaky automation steps.</small>
              </label>
              <label className="settings-input-field">
                <span>Video capture</span>
                <select
                  onChange={(event) => updateProjectAutomationSetting("videoMode", event.target.value as ProjectAutomationSettings["videoMode"])}
                  value={projectAutomationSettings.videoMode}
                >
                  <option value="retain-on-failure">Retain on failure</option>
                  <option value="on">Always capture</option>
                  <option value="off">Off</option>
                </select>
                <small>Default run-level video evidence behavior.</small>
              </label>
              <label className="settings-input-field">
                <span>Screenshots</span>
                <select
                  onChange={(event) => updateProjectAutomationSetting("screenshotMode", event.target.value as ProjectAutomationSettings["screenshotMode"])}
                  value={projectAutomationSettings.screenshotMode}
                >
                  <option value="only-on-failure">Only on failure</option>
                  <option value="on">Every step</option>
                  <option value="off">Off</option>
                </select>
                <small>Default screenshot policy for automation runs.</small>
              </label>
              <label className="settings-input-field">
                <span>Default LLM</span>
                <select
                  onChange={(event) => updateProjectAutomationSetting("defaultLlmIntegrationId", event.target.value)}
                  value={projectAutomationSettings.defaultLlmIntegrationId}
                >
                  <option value="">System default</option>
                  {llmIntegrations.map((integration) => (
                    <option key={integration.id} value={integration.id}>{integration.name}</option>
                  ))}
                </select>
                <small>Used by automation build, healing, and review flows when a project does not override it.</small>
              </label>
              <label className="settings-input-field">
                <span>Local engine URL</span>
                <input
                  onChange={(event) => updateProjectAutomationSetting("localEngineBaseUrl", event.target.value)}
                  value={projectAutomationSettings.localEngineBaseUrl}
                />
                <small>Default endpoint for local Playwright/Test Engine runs.</small>
              </label>
              <label className="settings-input-field">
                <span>Remote grid</span>
                <select
                  onChange={(event) => updateProjectAutomationSetting("remoteGridProvider", event.target.value as ProjectAutomationSettings["remoteGridProvider"])}
                  value={projectAutomationSettings.remoteGridProvider}
                >
                  <option value="default">Use active integration</option>
                  <option value="browserstack">BrowserStack</option>
                  <option value="lambdatest">LambdaTest</option>
                  <option value="saucelabs">Sauce Labs</option>
                  <option value="crossbrowser">CrossBrowser</option>
                </select>
                <small>Preferred cloud execution provider for remote runs.</small>
              </label>
            </div>
          </Panel>
	        ), { adminOnly: true }) : null}

        {renderSettingsSection("aiPromptMapping", "AI", "Prompt key mapping", (
          <Panel title="AI prompt registry" subtitle={canUseAutomationWorkspace ? "Central keys for AI prompt surfaces used by requirement, test design, automation, execution, and test data flows." : "Central keys for enabled AI requirement, test design, execution, and test data surfaces."}>
            <div className="settings-prompt-grid">
              {visibleAiPromptRegistry.map((prompt) => (
                <article className="settings-prompt-card" key={prompt.key}>
                  <div>
                    <strong>{prompt.label}</strong>
                    <span>{prompt.surface}</span>
                  </div>
                  <code>{prompt.key}</code>
                  <label className="settings-input-field settings-prompt-llm-field">
                    <span>LLM for this prompt</span>
                    <select
                      aria-label={`${prompt.label} LLM integration`}
                      onChange={(event) => setPromptLlmDrafts((current) => ({ ...current, [prompt.key]: event.target.value }))}
                      value={promptLlmDrafts[prompt.key] || ""}
                    >
                      <option value="">Use current fallback</option>
                      {llmIntegrations.map((integration) => (
                        <option key={integration.id} value={integration.id}>
                          {integration.name}{integration.model ? ` (${integration.model})` : ""}
                        </option>
                      ))}
                    </select>
                    <small>Overrides automatic LLM selection only for this prompt key.</small>
                  </label>
                  <textarea
                    aria-label={`${prompt.label} prompt text`}
                    onChange={(event) => setPromptDrafts((current) => ({ ...current, [prompt.key]: event.target.value }))}
                    rows={5}
                    value={promptDrafts[prompt.key] ?? prompt.value}
                  />
                  <button
                    className="ghost-button compact"
                    disabled={(promptDrafts[prompt.key] ?? prompt.value) === prompt.value}
                    onClick={() => setPromptDrafts((current) => ({ ...current, [prompt.key]: prompt.value }))}
                    type="button"
                  >
                    Reset default
                  </button>
                </article>
              ))}
            </div>
          </Panel>
	        ), { adminOnly: true })}

        {renderSettingsSection("exportRetention", "Evidence", "Export and retention", (
          <div className="two-column-grid">
            <Panel title="Export & retention" subtitle="Decide how much trace data should be surfaced and exported.">
              <div className="detail-stack">
                <label className="checkbox-field">
                  <input checked={autoExport} onChange={(event) => setAutoExport(event.target.checked)} type="checkbox" />
                  <span>{t("settings.export.autoPrompt", "Offer execution export prompts after completed runs")}</span>
                </label>
                <div className="detail-summary">
                  <strong>{t("settings.export.historyTitle", "Historical evidence is preserved")}</strong>
                  <span>{t("settings.export.historyCopy", "Deleting live suites or test cases does not remove execution snapshots already captured.")}</span>
                </div>
              </div>
            </Panel>
          </div>
	        ), { adminOnly: true })}

        {renderSettingsSection("notifications", "Notifications", "Notification preferences", (
          <Panel title="Notification routing" subtitle="Configure which workspace events should create in-app notifications or digest entries.">
            <div className="settings-preference-grid">
              {[
                ["executionFailures", "Execution failures and blocked runs"],
                ["executionCompletions", "Execution completions and run finalization"],
                ["runAssignments", "Run and case assignment changes"],
                ["issueReports", "Reported bugs and feedback updates"],
                ["aiDesign", "AI design previews and accepted generated cases"],
                ["aiAutomation", "AI automation build and recorder events"],
                ["importExport", "Import, export, backup, and sync jobs"],
                ["requirementChanges", "Requirement creation, completion, and coverage changes"],
                ["testCaseChanges", "Test case, suite, and shared step changes"],
                ["integrationChanges", "Integration activation, import, and credential changes"],
                ["userRoleChanges", "User, role, and permission changes"],
                ["projectMembership", "Project membership and app type changes"],
                ["scheduledRuns", "Scheduled run creation, execution, and failures"],
                ["inApp", "Show enabled events as in-app notifications"],
                ["digest", "Include enabled events in the daily digest"]
              ].filter(([key]) => canUseAutomationWorkspace || key !== "aiAutomation").map(([key, label]) => (
                <label className="checkbox-field" key={key}>
                  <input
                    checked={notificationPreferences[key as keyof NotificationPreferences]}
                    onChange={(event) =>
                      setNotificationPreferences((current) => ({
                        ...current,
                        [key]: event.target.checked
                      }))
                    }
                    type="checkbox"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </Panel>
	        ))}

        {renderSettingsSection("localization", "Localization", "Workspace language strings", (
          <Panel
            title={t("settings.localization.title", "Localization")}
            subtitle={t("settings.localization.subtitle", "Download the current runtime strings, edit the JSON, then upload it to relabel menus and supported interface text.")}
          >
            <div className="detail-stack">
              <div className="detail-summary">
                <strong>{Object.keys(strings).length} strings ready</strong>
                <span>{t("settings.localization.helper", "Only admins can publish updated localization strings for the workspace.")}</span>
              </div>

              <div className="action-row">
                <button className="ghost-button" onClick={handleDownloadLocalization} type="button">
                  {t("settings.localization.download", "Download current strings")}
                </button>
                <button
                  className="ghost-button"
                  disabled={!canManageLocalization || isSavingLocalization}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {t("settings.localization.upload", "Upload JSON")}
                </button>
                <button
                  className="ghost-button danger"
                  disabled={!canManageLocalization || isSavingLocalization}
                  onClick={() => void persistLocalization(DEFAULT_LOCALIZATION_STRINGS, "Uploaded localization reset to defaults.")}
                  type="button"
                >
                  {t("settings.localization.reset", "Reset uploaded strings")}
                </button>
              </div>

              <input
                accept="application/json"
                hidden
                onChange={(event) => void handleUploadLocalization(event)}
                ref={fileInputRef}
                type="file"
              />
            </div>
          </Panel>
        ), { adminOnly: true })}
      </div>
    </div>
  );
}
