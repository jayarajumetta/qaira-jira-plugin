import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import {
  ActivityIcon,
  AddIcon,
  ExportIcon,
  GithubIcon,
  GoogleDriveIcon,
  ImportIcon,
  MailIcon,
  PlugIcon,
  SparkIcon,
  UsersIcon
} from "../components/AppIcons";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { CatalogSelectionControls } from "../components/CatalogSelectionControls";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { FormField } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { TileCardSkeletonGrid } from "../components/TileCardSkeletonGrid";
import { ToastMessage } from "../components/ToastMessage";
import { TileCardStatusIndicator } from "../components/TileCardPrimitives";
import { WorkspaceBackButton, WorkspaceMasterDetail } from "../components/WorkspaceMasterDetail";
import { useDeleteConfirmation } from "../components/DeleteConfirmationDialog";
import { useDomainMetadata } from "../hooks/useDomainMetadata";
import { api } from "../lib/api";
import { buildBrowserUrl } from "../lib/integrationUrls";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import type { Integration } from "../types";

type IntegrationDraft = {
  type: Integration["type"];
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  project_key: string;
  username: string;
  is_active: boolean;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: boolean;
  smtp_password: string;
  sender_email: string;
  sender_name: string;
  google_client_id: string;
  sync_project_id: string;
  sync_schedule_mode: "manual" | "hourly" | "daily" | "weekly";
  google_drive_folder_id: string;
  github_owner: string;
  github_repo: string;
  github_branch: string;
  github_directory: string;
  github_file_extension: string;
  engine_project_id: string;
  engine_qaira_api_base_url: string;
  engine_callback_url: string;
  engine_callback_secret: string;
  engine_active_web_engine: "playwright" | "selenium";
  engine_browser: "chromium" | "firefox" | "webkit";
  engine_headless: boolean;
  engine_healing_enabled: boolean;
  engine_max_repair_attempts: string;
  engine_trace_mode: "off" | "on" | "on-first-retry" | "retain-on-failure";
  engine_video_mode: "off" | "on" | "retain-on-failure";
  engine_capture_console: boolean;
  engine_capture_network: boolean;
  engine_artifact_retention_days: string;
  engine_run_timeout_seconds: string;
  engine_navigation_timeout_ms: string;
  engine_action_timeout_ms: string;
  engine_assertion_timeout_ms: string;
  engine_recovery_wait_ms: string;
  engine_max_video_attachment_mb: string;
  engine_queue_poll_interval_minutes: string;
  engine_max_api_workers: string;
  engine_max_web_workers: string;
  engine_max_android_workers: string;
  engine_live_view_url: string;
  engine_mobile_engine_url: string;
  engine_mobile_cloud_provider: "none" | "saucelabs" | "lambdatest" | "browserstack" | "crossbrowser" | "other";
  engine_mobile_remote_url: string;
  engine_mobile_username: string;
  engine_mobile_access_key: string;
  engine_mobile_device_name: string;
  engine_mobile_platform_version: string;
  engine_android_app: string;
  cloud_run_provider: "browserstack" | "lambdatest" | "saucelabs" | "crossbrowser" | "other";
  cloud_run_project_id: string;
  cloud_run_remote_url: string;
  cloud_run_username: string;
  cloud_run_access_key: string;
  cloud_run_browser: string;
  cloud_run_os: string;
  cloud_run_device_name: string;
  cloud_run_platform_version: string;
  cloud_run_build_name: string;
  cloud_run_session_name: string;
  ops_project_id: string;
  ops_events_path: string;
  ops_health_path: string;
  ops_api_key_header: string;
  ops_api_key_prefix: string;
  ops_service_name: string;
  ops_environment: string;
  ops_timeout_ms: string;
  ops_emit_step_events: boolean;
  ops_emit_case_events: boolean;
  ops_emit_suite_events: boolean;
  ops_emit_run_events: boolean;
};

type IntegrationTypeDefinition = {
  value: Integration["type"];
  label: string;
  description?: string;
  icon?: string;
  defaults?: Record<string, unknown>;
};

type IntegrationCategoryKey = "ai" | "notification" | "sso" | "backup" | "repository" | "testgrid" | "ops";
type IntegrationTypeFilter = "all" | IntegrationCategoryKey;

const DEFAULT_INTEGRATION_TYPE: Integration["type"] = "llm";
const MASKED_SECRET_VALUE = "********";
const isMaskedSecretValue = (value: string) => value.trim() === MASKED_SECRET_VALUE || /^[*•●]{6,}$/.test(value.trim());

const INTEGRATION_CATEGORY_DEFINITIONS: Array<{
  value: IntegrationCategoryKey;
  label: string;
  description: string;
  defaultProvider: Integration["type"];
}> = [
  { value: "ai", label: "AI Providers", description: "LLM and model providers used by QAira AI flows.", defaultProvider: "llm" },
  { value: "testgrid", label: "TestGrid", description: "Local, remote, and cloud execution grid providers.", defaultProvider: "testengine" },
  { value: "repository", label: "Repository", description: "Source control providers for automation code sync.", defaultProvider: "github" },
  { value: "sso", label: "SSO", description: "Single sign-on identity providers.", defaultProvider: "google_auth" },
  { value: "backup", label: "Backup", description: "Workspace and project backup providers.", defaultProvider: "google_drive" },
  { value: "notification", label: "Notifications", description: "Outbound mail and notification delivery providers.", defaultProvider: "email" },
  { value: "ops", label: "OPS", description: "Operational telemetry and event sink providers.", defaultProvider: "ops" }
];

function getIntegrationCategoryKey(type: Integration["type"]): IntegrationCategoryKey {
  switch (type) {
    case "testengine":
    case "cloudrun":
    case "local-desktop":
      return "testgrid";
    case "github":
      return "repository";
    case "google_auth":
      return "sso";
    case "google_drive":
      return "backup";
    case "email":
      return "notification";
    case "ops":
      return "ops";
    case "llm":
    default:
      return "ai";
  }
}

function getIntegrationCategoryDefinition(value: IntegrationTypeFilter) {
  return value === "all" ? null : INTEGRATION_CATEGORY_DEFINITIONS.find((definition) => definition.value === value) || null;
}

function getIntegrationProvidersForCategory(category: IntegrationCategoryKey, definitions: IntegrationTypeDefinition[]) {
  return definitions.filter((definition) => getIntegrationCategoryKey(definition.value) === category);
}

const getIntegrationTypeDefinition = (type: Integration["type"], definitions: IntegrationTypeDefinition[]) =>
  definitions.find((definition) => definition.value === type);

const getLlmDefaultBaseUrl = (definitions: IntegrationTypeDefinition[]) => {
  const llmDefaults = getIntegrationTypeDefinition("llm", definitions)?.defaults || {};
  return typeof llmDefaults.base_url === "string" ? llmDefaults.base_url : "";
};

const buildEmptyDraft = (
  definitions: IntegrationTypeDefinition[],
  preferredType: Integration["type"] = DEFAULT_INTEGRATION_TYPE
): IntegrationDraft => {
  const defaultType = (
    getIntegrationTypeDefinition(preferredType, definitions)?.value ||
    definitions[0]?.value ||
    DEFAULT_INTEGRATION_TYPE
  ) as Integration["type"];
  const llmDefaults = getIntegrationTypeDefinition("llm", definitions)?.defaults || {};
  const emailDefaults = getIntegrationTypeDefinition("email", definitions)?.defaults || {};
  const testEngineDefaults = getIntegrationTypeDefinition("testengine", definitions)?.defaults || {};
  const cloudRunDefaults = getIntegrationTypeDefinition("cloudrun", definitions)?.defaults || {};
  const opsDefaults = getIntegrationTypeDefinition("ops", definitions)?.defaults || {};

  return {
    type: defaultType,
    name: "",
    base_url: defaultType === "llm" && typeof llmDefaults.base_url === "string" ? llmDefaults.base_url : "",
    api_key: "",
    model: "",
    project_key: "",
    username: "",
    is_active: true,
    smtp_host: "",
    smtp_port: String(emailDefaults.smtp_port ?? "587"),
    smtp_secure: false,
    smtp_password: "",
    sender_email: typeof emailDefaults.sender_email === "string" ? emailDefaults.sender_email : "",
    sender_name: typeof emailDefaults.sender_name === "string" ? emailDefaults.sender_name : "",
    google_client_id: "",
    sync_project_id: "",
    sync_schedule_mode: "manual",
    google_drive_folder_id: "",
    github_owner: "",
    github_repo: "",
    github_branch: "main",
    github_directory: "qaira-sync",
    github_file_extension: "ts",
    engine_project_id: "",
    engine_qaira_api_base_url: "",
    engine_callback_url: "",
    engine_callback_secret: "",
    engine_active_web_engine: (typeof testEngineDefaults.active_web_engine === "string" ? testEngineDefaults.active_web_engine : "playwright") as IntegrationDraft["engine_active_web_engine"],
    engine_browser: (typeof testEngineDefaults.browser === "string" ? testEngineDefaults.browser : "chromium") as IntegrationDraft["engine_browser"],
    engine_headless: testEngineDefaults.headless === true,
    engine_healing_enabled: testEngineDefaults.healing_enabled !== false,
    engine_max_repair_attempts: String(testEngineDefaults.max_repair_attempts ?? "2"),
    engine_trace_mode: (typeof testEngineDefaults.trace_mode === "string" ? testEngineDefaults.trace_mode : "on-first-retry") as IntegrationDraft["engine_trace_mode"],
    engine_video_mode: (typeof testEngineDefaults.video_mode === "string" ? testEngineDefaults.video_mode : "retain-on-failure") as IntegrationDraft["engine_video_mode"],
    engine_capture_console: testEngineDefaults.capture_console !== false,
    engine_capture_network: testEngineDefaults.capture_network !== false,
    engine_artifact_retention_days: String(testEngineDefaults.artifact_retention_days ?? "14"),
    engine_run_timeout_seconds: String(testEngineDefaults.run_timeout_seconds ?? "1800"),
    engine_navigation_timeout_ms: String(testEngineDefaults.navigation_timeout_ms ?? "30000"),
    engine_action_timeout_ms: String(testEngineDefaults.action_timeout_ms ?? "5000"),
    engine_assertion_timeout_ms: String(testEngineDefaults.assertion_timeout_ms ?? "10000"),
    engine_recovery_wait_ms: String(testEngineDefaults.recovery_wait_ms ?? "750"),
    engine_max_video_attachment_mb: String(testEngineDefaults.max_video_attachment_mb ?? "25"),
    engine_queue_poll_interval_minutes: String(testEngineDefaults.queue_poll_interval_minutes ?? "5"),
    engine_max_api_workers: String(testEngineDefaults.max_api_workers ?? "10"),
    engine_max_web_workers: String(testEngineDefaults.max_web_workers ?? "5"),
    engine_max_android_workers: String(testEngineDefaults.max_android_workers ?? "2"),
    engine_live_view_url: "",
    engine_mobile_engine_url: "http://mobile-engine:4312",
    engine_mobile_cloud_provider: "none",
    engine_mobile_remote_url: "",
    engine_mobile_username: "",
    engine_mobile_access_key: "",
    engine_mobile_device_name: "",
    engine_mobile_platform_version: "",
    engine_android_app: "",
    cloud_run_provider: (typeof cloudRunDefaults.provider === "string" ? cloudRunDefaults.provider : "browserstack") as IntegrationDraft["cloud_run_provider"],
    cloud_run_project_id: "",
    cloud_run_remote_url: typeof cloudRunDefaults.remote_url === "string" ? cloudRunDefaults.remote_url : "",
    cloud_run_username: "",
    cloud_run_access_key: "",
    cloud_run_browser: typeof cloudRunDefaults.browser === "string" ? cloudRunDefaults.browser : "Chrome",
    cloud_run_os: typeof cloudRunDefaults.os === "string" ? cloudRunDefaults.os : "Windows",
    cloud_run_device_name: "",
    cloud_run_platform_version: "",
    cloud_run_build_name: "",
    cloud_run_session_name: "",
    ops_project_id: "",
    ops_events_path: typeof opsDefaults.events_path === "string" ? opsDefaults.events_path : "/api/v1/events",
    ops_health_path: typeof opsDefaults.health_path === "string" ? opsDefaults.health_path : "/health",
    ops_api_key_header: typeof opsDefaults.api_key_header === "string" ? opsDefaults.api_key_header : "Authorization",
    ops_api_key_prefix: typeof opsDefaults.api_key_prefix === "string" ? opsDefaults.api_key_prefix : "Bearer",
    ops_service_name: typeof opsDefaults.service_name === "string" ? opsDefaults.service_name : "qaira-testengine",
    ops_environment: typeof opsDefaults.environment === "string" ? opsDefaults.environment : "production",
    ops_timeout_ms: String(opsDefaults.timeout_ms ?? "4000"),
    ops_emit_step_events: opsDefaults.emit_step_events !== false,
    ops_emit_case_events: opsDefaults.emit_case_events !== false,
    ops_emit_suite_events: opsDefaults.emit_suite_events !== false,
    ops_emit_run_events: opsDefaults.emit_run_events !== false
  };
};

function getIntegrationTypeLabel(type: Integration["type"], definitions: IntegrationTypeDefinition[]) {
  return getIntegrationTypeDefinition(type, definitions)?.label || type;
}

function IntegrationBadgeSvg({
  children
}: {
  children: ReactNode;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
      viewBox="0 0 24 24"
      width="18"
    >
      {children}
    </svg>
  );
}

function TestEngineIntegrationIcon() {
  return (
    <IntegrationBadgeSvg>
      <rect height="8" rx="2" width="14" x="5" y="4" />
      <path d="M8 20h8" />
      <path d="M12 12v8" />
      <path d="m10 8 4 2-4 2Z" />
    </IntegrationBadgeSvg>
  );
}

function CloudRunIntegrationIcon() {
  return (
    <IntegrationBadgeSvg>
      <path d="M8 17.5H7a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.4-1.8A4.5 4.5 0 0 1 17 17.5h-1" />
      <path d="m10 12 4 2-4 2Z" />
      <path d="M14 14h4" />
    </IntegrationBadgeSvg>
  );
}

function GoogleAuthIntegrationIcon() {
  return (
    <IntegrationBadgeSvg>
      <path d="M12 4.5 6.5 7v4.2c0 3.4 2.2 6.5 5.5 7.8 3.3-1.3 5.5-4.4 5.5-7.8V7Z" />
      <path d="m9.5 11.8 1.7 1.7 3.3-3.3" />
    </IntegrationBadgeSvg>
  );
}

function getIntegrationBadgeIcon(type: Integration["type"]) {
  switch (type) {
    case "llm":
      return <SparkIcon size={18} />;
    case "email":
      return <MailIcon size={18} />;
    case "google_auth":
      return <GoogleAuthIntegrationIcon />;
    case "google_drive":
      return <GoogleDriveIcon size={18} />;
    case "github":
      return <GithubIcon size={18} />;
    case "testengine":
    case "local-desktop":
      return <TestEngineIntegrationIcon />;
    case "cloudrun":
      return <CloudRunIntegrationIcon />;
    case "ops":
      return <ActivityIcon size={18} />;
    default:
      return <UsersIcon size={18} />;
  }
}

function buildReadableIntegrationUrl(baseUrl?: string | null, path?: string | null) {
  const normalizedBaseUrl = String(baseUrl || "").trim();

  if (!normalizedBaseUrl) {
    return "";
  }

  try {
    const base = new URL(normalizedBaseUrl);
    return new URL(String(path || "/health").trim() || "/", base).toString();
  } catch {
    return "";
  }
}

function buildReadableIntegrationBrowserUrl(integration: Integration | null | undefined, path?: string | null) {
  return buildBrowserUrl(integration, String(path || "/health").trim() || "/", [
    "ops_public_base_url",
    "public_base_url",
    "recorder_public_base_url",
    "live_view_url"
  ]);
}

function buildTestEngineLiveViewUrl(baseUrl: string, provider: IntegrationDraft["engine_active_web_engine"]) {
  const normalizedBaseUrl = String(baseUrl || "").trim();

  if (!normalizedBaseUrl) {
    return "";
  }

  try {
    const parsed = new URL(normalizedBaseUrl);

    if (provider === "selenium") {
      parsed.port = "7900";
      parsed.pathname = "/";
      parsed.search = "?autoconnect=1&resize=scale";
      parsed.hash = "";
      return parsed.toString();
    }

    parsed.pathname = "/api/v1/live-session";
    parsed.search = "?provider=playwright";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function isAutoDerivedLiveViewUrl(value: string) {
  const normalized = value.trim();
  return !normalized || normalized.includes(":7900/") || normalized.includes("/api/v1/live-session");
}

function isLiveViewUrlCompatible(value: string, provider: IntegrationDraft["engine_active_web_engine"]) {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  if (provider === "playwright") {
    return !normalized.includes(":7900/") && !normalized.toLowerCase().includes("vnc");
  }

  return !normalized.includes("/api/v1/live-session");
}

function applyDraftDefaultsForType(type: Integration["type"], current: IntegrationDraft, definitions: IntegrationTypeDefinition[]): IntegrationDraft {
  const llmDefaults = getIntegrationTypeDefinition("llm", definitions)?.defaults || {};
  const emailDefaults = getIntegrationTypeDefinition("email", definitions)?.defaults || {};
  const testEngineDefaults = getIntegrationTypeDefinition("testengine", definitions)?.defaults || {};
  const cloudRunDefaults = getIntegrationTypeDefinition("cloudrun", definitions)?.defaults || {};
  const opsDefaults = getIntegrationTypeDefinition("ops", definitions)?.defaults || {};
  const llmDefaultBaseUrl = getLlmDefaultBaseUrl(definitions);
  const nextBaseUrl = current.base_url === llmDefaultBaseUrl ? "" : current.base_url;

  if (type === "llm") {
    return {
      ...current,
      type,
      base_url: current.base_url || (typeof llmDefaults.base_url === "string" ? llmDefaults.base_url : "")
    };
  }

  if (type === "email") {
    return {
      ...current,
      type,
      base_url: nextBaseUrl,
      smtp_port: current.smtp_port || String(emailDefaults.smtp_port ?? "587"),
      sender_email: current.sender_email || (typeof emailDefaults.sender_email === "string" ? emailDefaults.sender_email : ""),
      sender_name: current.sender_name || (typeof emailDefaults.sender_name === "string" ? emailDefaults.sender_name : "")
    };
  }

  if (type === "google_drive") {
    return {
      ...current,
      type,
      base_url: nextBaseUrl,
      sync_schedule_mode: current.sync_schedule_mode || "manual"
    };
  }

  if (type === "github") {
    return {
      ...current,
      type,
      base_url: nextBaseUrl,
      github_branch: current.github_branch || "main",
      github_directory: current.github_directory || "qaira-sync",
      github_file_extension: current.github_file_extension || "ts",
      sync_schedule_mode: current.sync_schedule_mode || "manual"
    };
  }

  if (type === "testengine") {
    return {
      ...current,
      type,
      base_url: nextBaseUrl,
      engine_active_web_engine: (current.engine_active_web_engine || String(testEngineDefaults.active_web_engine || "playwright")) as IntegrationDraft["engine_active_web_engine"],
      engine_browser: (current.engine_browser || String(testEngineDefaults.browser || "chromium")) as IntegrationDraft["engine_browser"],
      engine_headless: current.engine_headless,
      engine_healing_enabled: current.engine_healing_enabled,
      engine_max_repair_attempts: current.engine_max_repair_attempts || String(testEngineDefaults.max_repair_attempts ?? "2"),
      engine_trace_mode: (current.engine_trace_mode || String(testEngineDefaults.trace_mode || "on-first-retry")) as IntegrationDraft["engine_trace_mode"],
      engine_video_mode: (current.engine_video_mode || String(testEngineDefaults.video_mode || "retain-on-failure")) as IntegrationDraft["engine_video_mode"],
      engine_capture_console: current.engine_capture_console,
      engine_capture_network: current.engine_capture_network,
      engine_artifact_retention_days: current.engine_artifact_retention_days || String(testEngineDefaults.artifact_retention_days ?? "14"),
      engine_run_timeout_seconds: current.engine_run_timeout_seconds || String(testEngineDefaults.run_timeout_seconds ?? "1800"),
      engine_navigation_timeout_ms: current.engine_navigation_timeout_ms || String(testEngineDefaults.navigation_timeout_ms ?? "30000"),
      engine_action_timeout_ms: current.engine_action_timeout_ms || String(testEngineDefaults.action_timeout_ms ?? "5000"),
      engine_assertion_timeout_ms: current.engine_assertion_timeout_ms || String(testEngineDefaults.assertion_timeout_ms ?? "10000"),
      engine_recovery_wait_ms: current.engine_recovery_wait_ms || String(testEngineDefaults.recovery_wait_ms ?? "750"),
      engine_max_video_attachment_mb: current.engine_max_video_attachment_mb || String(testEngineDefaults.max_video_attachment_mb ?? "25"),
      engine_queue_poll_interval_minutes: current.engine_queue_poll_interval_minutes || String(testEngineDefaults.queue_poll_interval_minutes ?? "5")
    };
  }

  if (type === "ops") {
    return {
      ...current,
      type,
      base_url: "",
      ops_events_path: current.ops_events_path || String(opsDefaults.events_path || "/api/v1/events"),
      ops_health_path: current.ops_health_path || String(opsDefaults.health_path || "/health"),
      ops_api_key_header: current.ops_api_key_header || String(opsDefaults.api_key_header || "Authorization"),
      ops_api_key_prefix:
        current.ops_api_key_prefix === ""
          ? ""
          : current.ops_api_key_prefix || String(opsDefaults.api_key_prefix || "Bearer"),
      ops_service_name: current.ops_service_name || String(opsDefaults.service_name || "qaira-testengine"),
      ops_environment: current.ops_environment || String(opsDefaults.environment || "production"),
      ops_timeout_ms: current.ops_timeout_ms || String(opsDefaults.timeout_ms ?? "4000"),
      ops_emit_step_events: current.ops_emit_step_events,
      ops_emit_case_events: current.ops_emit_case_events,
      ops_emit_suite_events: current.ops_emit_suite_events,
      ops_emit_run_events: current.ops_emit_run_events
    };
  }

  if (type === "cloudrun") {
    return {
      ...current,
      type,
      base_url: current.base_url === llmDefaultBaseUrl ? "" : current.base_url,
      cloud_run_provider: (current.cloud_run_provider || String(cloudRunDefaults.provider || "browserstack")) as IntegrationDraft["cloud_run_provider"],
      cloud_run_remote_url: current.cloud_run_remote_url || String(cloudRunDefaults.remote_url || ""),
      cloud_run_browser: current.cloud_run_browser || String(cloudRunDefaults.browser || "Chrome"),
      cloud_run_os: current.cloud_run_os || String(cloudRunDefaults.os || "Windows")
    };
  }

  return {
    ...current,
    type,
    base_url: nextBaseUrl
  };
}

function getDraftFromIntegration(
  integration: Integration,
  definitions: IntegrationTypeDefinition[],
  preferredType: Integration["type"] = DEFAULT_INTEGRATION_TYPE
): IntegrationDraft {
  const config: Record<string, unknown> = integration.config || {};
  const emptyDraft = buildEmptyDraft(definitions, preferredType);
  const storedEngineProvider = (typeof config.active_web_engine === "string" ? config.active_web_engine : emptyDraft.engine_active_web_engine) as IntegrationDraft["engine_active_web_engine"];
  const storedLiveViewUrl = typeof config.live_view_url === "string" ? config.live_view_url : "";

  return applyDraftDefaultsForType(integration.type, {
    ...emptyDraft,
    type: integration.type,
    name: integration.name,
    base_url: integration.base_url || (integration.type === "llm" ? emptyDraft.base_url : ""),
    api_key: integration.api_key || "",
    model: integration.model || "",
    project_key: integration.project_key || "",
    username: integration.username || "",
    is_active: integration.is_active,
    smtp_host: typeof config.host === "string" ? config.host : "",
    smtp_port:
      typeof config.port === "number"
        ? String(config.port)
        : typeof config.port === "string"
          ? config.port
          : emptyDraft.smtp_port,
    smtp_secure: Boolean(config.secure),
    smtp_password: typeof config.password === "string" ? config.password : "",
    sender_email: typeof config.sender_email === "string" ? config.sender_email : emptyDraft.sender_email,
    sender_name: typeof config.sender_name === "string" ? config.sender_name : emptyDraft.sender_name,
    google_client_id: typeof config.client_id === "string" ? config.client_id : "",
    sync_project_id: typeof config.project_id === "string" ? config.project_id : "",
    sync_schedule_mode: (typeof config.schedule_mode === "string" ? config.schedule_mode : emptyDraft.sync_schedule_mode) as IntegrationDraft["sync_schedule_mode"],
    google_drive_folder_id: typeof config.folder_id === "string" ? config.folder_id : "",
    github_owner: typeof config.owner === "string" ? config.owner : "",
    github_repo: typeof config.repo === "string" ? config.repo : "",
    github_branch: typeof config.branch === "string" ? config.branch : emptyDraft.github_branch,
    github_directory: typeof config.directory === "string" ? config.directory : emptyDraft.github_directory,
    github_file_extension: typeof config.file_extension === "string" ? config.file_extension : emptyDraft.github_file_extension,
    engine_project_id: typeof config.project_id === "string" ? config.project_id : "",
    engine_qaira_api_base_url: typeof config.qaira_api_base_url === "string" ? config.qaira_api_base_url : "",
    engine_callback_url: typeof config.callback_url === "string" ? config.callback_url : "",
    engine_callback_secret: typeof config.callback_secret === "string" ? config.callback_secret : "",
    engine_active_web_engine: storedEngineProvider,
    engine_browser: (typeof config.browser === "string" ? config.browser : emptyDraft.engine_browser) as IntegrationDraft["engine_browser"],
    engine_headless: typeof config.headless === "boolean" ? config.headless : emptyDraft.engine_headless,
    engine_healing_enabled: typeof config.healing_enabled === "boolean" ? config.healing_enabled : emptyDraft.engine_healing_enabled,
    engine_max_repair_attempts:
      typeof config.max_repair_attempts === "number"
        ? String(config.max_repair_attempts)
        : typeof config.max_repair_attempts === "string"
          ? config.max_repair_attempts
          : emptyDraft.engine_max_repair_attempts,
    engine_trace_mode: (typeof config.trace_mode === "string" ? config.trace_mode : emptyDraft.engine_trace_mode) as IntegrationDraft["engine_trace_mode"],
    engine_video_mode: (typeof config.video_mode === "string" ? config.video_mode : emptyDraft.engine_video_mode) as IntegrationDraft["engine_video_mode"],
    engine_capture_console: typeof config.capture_console === "boolean" ? config.capture_console : emptyDraft.engine_capture_console,
    engine_capture_network: typeof config.capture_network === "boolean" ? config.capture_network : emptyDraft.engine_capture_network,
    engine_artifact_retention_days:
      typeof config.artifact_retention_days === "number"
        ? String(config.artifact_retention_days)
        : typeof config.artifact_retention_days === "string"
          ? config.artifact_retention_days
          : emptyDraft.engine_artifact_retention_days,
    engine_run_timeout_seconds:
      typeof config.run_timeout_seconds === "number"
        ? String(config.run_timeout_seconds)
        : typeof config.run_timeout_seconds === "string"
          ? config.run_timeout_seconds
          : emptyDraft.engine_run_timeout_seconds,
    engine_navigation_timeout_ms:
      typeof config.navigation_timeout_ms === "number"
        ? String(config.navigation_timeout_ms)
        : typeof config.navigation_timeout_ms === "string"
          ? config.navigation_timeout_ms
          : emptyDraft.engine_navigation_timeout_ms,
    engine_action_timeout_ms:
      typeof config.action_timeout_ms === "number"
        ? String(config.action_timeout_ms)
        : typeof config.action_timeout_ms === "string"
          ? config.action_timeout_ms
          : emptyDraft.engine_action_timeout_ms,
    engine_assertion_timeout_ms:
      typeof config.assertion_timeout_ms === "number"
        ? String(config.assertion_timeout_ms)
        : typeof config.assertion_timeout_ms === "string"
          ? config.assertion_timeout_ms
          : emptyDraft.engine_assertion_timeout_ms,
    engine_recovery_wait_ms:
      typeof config.recovery_wait_ms === "number"
        ? String(config.recovery_wait_ms)
        : typeof config.recovery_wait_ms === "string"
          ? config.recovery_wait_ms
          : emptyDraft.engine_recovery_wait_ms,
    engine_max_video_attachment_mb:
      typeof config.max_video_attachment_mb === "number"
        ? String(config.max_video_attachment_mb)
        : typeof config.max_video_attachment_mb === "string"
          ? config.max_video_attachment_mb
          : emptyDraft.engine_max_video_attachment_mb,
    engine_queue_poll_interval_minutes:
      typeof config.queue_poll_interval_minutes === "number"
        ? String(config.queue_poll_interval_minutes)
        : typeof config.queue_poll_interval_minutes === "string"
          ? config.queue_poll_interval_minutes
          : emptyDraft.engine_queue_poll_interval_minutes,
    engine_max_api_workers:
      typeof config.max_api_workers === "number"
        ? String(config.max_api_workers)
        : typeof config.max_api_workers === "string"
          ? config.max_api_workers
          : emptyDraft.engine_max_api_workers,
    engine_max_web_workers:
      typeof config.max_web_workers === "number"
        ? String(config.max_web_workers)
        : typeof config.max_web_workers === "string"
          ? config.max_web_workers
          : emptyDraft.engine_max_web_workers,
    engine_max_android_workers:
      typeof config.max_android_workers === "number"
        ? String(config.max_android_workers)
        : typeof config.max_android_workers === "string"
          ? config.max_android_workers
          : emptyDraft.engine_max_android_workers,
    engine_live_view_url: isLiveViewUrlCompatible(storedLiveViewUrl, storedEngineProvider)
      ? storedLiveViewUrl
      : buildTestEngineLiveViewUrl(integration.base_url || "", storedEngineProvider),
    engine_mobile_engine_url: typeof config.mobile_engine_url === "string" ? config.mobile_engine_url : emptyDraft.engine_mobile_engine_url,
    engine_mobile_cloud_provider: (typeof config.mobile_cloud_provider === "string" ? config.mobile_cloud_provider : "none") as IntegrationDraft["engine_mobile_cloud_provider"],
    engine_mobile_remote_url: typeof config.mobile_remote_url === "string" ? config.mobile_remote_url : "",
    engine_mobile_username: typeof config.mobile_username === "string" ? config.mobile_username : "",
    engine_mobile_access_key: typeof config.mobile_access_key === "string" ? config.mobile_access_key : "",
    engine_mobile_device_name: typeof config.device_name === "string" ? config.device_name : "",
    engine_mobile_platform_version: typeof config.platform_version === "string" ? config.platform_version : "",
    engine_android_app: typeof config.android_app === "string" ? config.android_app : "",
    cloud_run_provider: (typeof config.provider === "string" ? config.provider : emptyDraft.cloud_run_provider) as IntegrationDraft["cloud_run_provider"],
    cloud_run_project_id: typeof config.project_id === "string" ? config.project_id : "",
    cloud_run_remote_url: typeof config.remote_url === "string" ? config.remote_url : integration.type === "cloudrun" ? integration.base_url || "" : "",
    cloud_run_username: integration.type === "cloudrun" ? integration.username || "" : "",
    cloud_run_access_key: integration.type === "cloudrun" ? integration.api_key || "" : "",
    cloud_run_browser: typeof config.browser === "string" ? config.browser : emptyDraft.cloud_run_browser,
    cloud_run_os: typeof config.os === "string" ? config.os : emptyDraft.cloud_run_os,
    cloud_run_device_name: typeof config.device_name === "string" ? config.device_name : "",
    cloud_run_platform_version: typeof config.platform_version === "string" ? config.platform_version : "",
    cloud_run_build_name: typeof config.build_name === "string" ? config.build_name : "",
    cloud_run_session_name: typeof config.session_name === "string" ? config.session_name : "",
    ops_project_id: typeof config.project_id === "string" ? config.project_id : "",
    ops_events_path: typeof config.events_path === "string" ? config.events_path : emptyDraft.ops_events_path,
    ops_health_path: typeof config.health_path === "string" ? config.health_path : emptyDraft.ops_health_path,
    ops_api_key_header: typeof config.api_key_header === "string" ? config.api_key_header : emptyDraft.ops_api_key_header,
    ops_api_key_prefix:
      typeof config.api_key_prefix === "string"
        ? config.api_key_prefix
        : emptyDraft.ops_api_key_prefix,
    ops_service_name: typeof config.service_name === "string" ? config.service_name : emptyDraft.ops_service_name,
    ops_environment: typeof config.environment === "string" ? config.environment : emptyDraft.ops_environment,
    ops_timeout_ms:
      typeof config.timeout_ms === "number"
        ? String(config.timeout_ms)
        : typeof config.timeout_ms === "string"
          ? config.timeout_ms
          : emptyDraft.ops_timeout_ms,
    ops_emit_step_events: typeof config.emit_step_events === "boolean" ? config.emit_step_events : emptyDraft.ops_emit_step_events,
    ops_emit_case_events: typeof config.emit_case_events === "boolean" ? config.emit_case_events : emptyDraft.ops_emit_case_events,
    ops_emit_suite_events: typeof config.emit_suite_events === "boolean" ? config.emit_suite_events : emptyDraft.ops_emit_suite_events,
    ops_emit_run_events: typeof config.emit_run_events === "boolean" ? config.emit_run_events : emptyDraft.ops_emit_run_events
  }, definitions);
}

function buildIntegrationConfig(draft: IntegrationDraft, definitions: IntegrationTypeDefinition[]): Record<string, unknown> {
  const emailDefaults = getIntegrationTypeDefinition("email", definitions)?.defaults || {};

  if (draft.type === "email") {
    return {
      host: draft.smtp_host.trim(),
      port: Number.parseInt(draft.smtp_port, 10),
      secure: draft.smtp_secure,
      ...(draft.smtp_password.trim() && !isMaskedSecretValue(draft.smtp_password) ? { password: draft.smtp_password } : {}),
      sender_email: draft.sender_email.trim() || String(emailDefaults.sender_email || ""),
      sender_name: draft.sender_name.trim() || String(emailDefaults.sender_name || "")
    };
  }

  if (draft.type === "google_auth") {
    return {
      client_id: draft.google_client_id.trim()
    };
  }

  if (draft.type === "google_drive") {
    return {
      project_id: draft.sync_project_id,
      folder_id: draft.google_drive_folder_id.trim(),
      schedule_mode: draft.sync_schedule_mode,
      include_requirements_csv: true,
      include_test_cases_csv: true
    };
  }

  if (draft.type === "github") {
    return {
      project_id: draft.sync_project_id,
      owner: draft.github_owner.trim(),
      repo: draft.github_repo.trim(),
      branch: draft.github_branch.trim() || "main",
      directory: draft.github_directory.trim() || "qaira-sync",
      file_extension: draft.github_file_extension.trim() || "ts",
      schedule_mode: draft.sync_schedule_mode
    };
  }

  if (draft.type === "testengine") {
    return {
      project_id: draft.engine_project_id || undefined,
      qaira_api_base_url: draft.engine_qaira_api_base_url.trim() || null,
      runner: "hybrid",
      dispatch_mode: "qaira-pull",
      execution_scope: "api+web",
      active_web_engine: draft.engine_active_web_engine,
      browser: draft.engine_browser,
      headless: draft.engine_headless,
      healing_enabled: draft.engine_healing_enabled,
      max_repair_attempts: Number.parseInt(draft.engine_max_repair_attempts, 10) || 0,
      trace_mode: draft.engine_trace_mode,
      video_mode: draft.engine_video_mode,
      capture_console: draft.engine_capture_console,
      capture_network: draft.engine_capture_network,
      artifact_retention_days: Number.parseInt(draft.engine_artifact_retention_days, 10) || 7,
      run_timeout_seconds: Number.parseInt(draft.engine_run_timeout_seconds, 10) || 1800,
      navigation_timeout_ms: Number.parseInt(draft.engine_navigation_timeout_ms, 10) || 30000,
      action_timeout_ms: Number.parseInt(draft.engine_action_timeout_ms, 10) || 5000,
      assertion_timeout_ms: Number.parseInt(draft.engine_assertion_timeout_ms, 10) || 10000,
      recovery_wait_ms: Number.parseInt(draft.engine_recovery_wait_ms, 10) || 750,
      max_video_attachment_mb: Number.parseInt(draft.engine_max_video_attachment_mb, 10) || 25,
      queue_poll_interval_minutes: Number.parseFloat(draft.engine_queue_poll_interval_minutes) || 5,
      max_api_workers: Number.parseInt(draft.engine_max_api_workers, 10) || 10,
      max_web_workers: Number.parseInt(draft.engine_max_web_workers, 10) || 5,
      max_android_workers: Number.parseInt(draft.engine_max_android_workers, 10) || 2,
      live_view_url: draft.engine_live_view_url.trim() || null,
      mobile_engine_url: draft.engine_mobile_engine_url.trim() || null,
      mobile_cloud_provider: draft.engine_mobile_cloud_provider,
      mobile_remote_url: draft.engine_mobile_remote_url.trim() || null,
      mobile_username: draft.engine_mobile_username.trim() || null,
      mobile_access_key: isMaskedSecretValue(draft.engine_mobile_access_key) ? undefined : draft.engine_mobile_access_key.trim() || null,
      device_name: draft.engine_mobile_device_name.trim() || null,
      platform_version: draft.engine_mobile_platform_version.trim() || null,
      android_app: draft.engine_android_app.trim() || null,
      promote_healed_patches: "review"
    };
  }

  if (draft.type === "cloudrun") {
    return {
      provider: draft.cloud_run_provider,
      project_id: draft.cloud_run_project_id || undefined,
      remote_url: draft.cloud_run_remote_url.trim() || draft.base_url.trim() || null,
      browser: draft.cloud_run_browser.trim() || "Chrome",
      os: draft.cloud_run_os.trim() || "Windows",
      device_name: draft.cloud_run_device_name.trim() || null,
      platform_version: draft.cloud_run_platform_version.trim() || null,
      build_name: draft.cloud_run_build_name.trim() || null,
      session_name: draft.cloud_run_session_name.trim() || null,
      provider_options: {}
    };
  }

  if (draft.type === "ops") {
    return {
      project_id: draft.ops_project_id || undefined,
      events_path: draft.ops_events_path.trim() || "/api/v1/events",
      health_path: draft.ops_health_path.trim() || "/health",
      api_key_header: draft.ops_api_key_header.trim() || "Authorization",
      api_key_prefix: draft.ops_api_key_prefix,
      service_name: draft.ops_service_name.trim() || "qaira-testengine",
      environment: draft.ops_environment.trim() || "production",
      timeout_ms: Number.parseInt(draft.ops_timeout_ms, 10) || 4000,
      emit_step_events: draft.ops_emit_step_events,
      emit_case_events: draft.ops_emit_case_events,
      emit_suite_events: draft.ops_emit_suite_events,
      emit_run_events: draft.ops_emit_run_events
    };
  }

  return {};
}

function getIntegrationSummary(integration: Integration, definitions: IntegrationTypeDefinition[]) {
  const config: Record<string, unknown> = integration.config || {};
  const emailDefaults = getIntegrationTypeDefinition("email", definitions)?.defaults || {};

  if (integration.type === "llm") {
    return {
      primary: integration.model || "Model not set",
      secondary: integration.base_url || "No base URL configured"
    };
  }

  if (integration.type === "email") {
    const host = typeof config.host === "string" ? config.host : "";
    const port = typeof config.port === "number" ? config.port : typeof config.port === "string" ? config.port : "";

    return {
      primary: typeof config.sender_email === "string" ? config.sender_email : String(emailDefaults.sender_email || ""),
      secondary: host ? `${host}${port ? `:${port}` : ""}` : "SMTP server not set"
    };
  }

  if (integration.type === "google_drive") {
    return {
      primary: typeof config.folder_id === "string" ? config.folder_id : "Folder not set",
      secondary: typeof config.last_sync_summary === "string" ? config.last_sync_summary : "Compressed project artifact backup"
    };
  }

  if (integration.type === "github") {
    const repository =
      typeof config.owner === "string" && typeof config.repo === "string" && config.owner && config.repo
        ? `${config.owner}/${config.repo}`
        : "Repository not set";

    return {
      primary: repository,
      secondary: typeof config.last_sync_summary === "string" ? config.last_sync_summary : "Project automation code sync"
    };
  }

  if (integration.type === "testengine") {
    const activeWebEngine = typeof config.active_web_engine === "string" ? config.active_web_engine : "playwright";
    const pollIntervalMinutes =
      typeof config.queue_poll_interval_minutes === "number"
        ? config.queue_poll_interval_minutes
        : typeof config.queue_poll_interval_minutes === "string"
          ? Number.parseFloat(config.queue_poll_interval_minutes) || 5
          : 5;

    const qairaApiBaseUrl = typeof config.qaira_api_base_url === "string" && config.qaira_api_base_url.trim()
      ? config.qaira_api_base_url.trim()
      : "";
    const apiWorkers = typeof config.max_api_workers === "number" || typeof config.max_api_workers === "string" ? String(config.max_api_workers) : "10";
    const webWorkers = typeof config.max_web_workers === "number" || typeof config.max_web_workers === "string" ? String(config.max_web_workers) : "5";
    const androidWorkers = typeof config.max_android_workers === "number" || typeof config.max_android_workers === "string" ? String(config.max_android_workers) : "2";

    return {
      primary: integration.base_url || "Engine host not set",
      secondary: `${typeof config.project_id === "string" && config.project_id.trim() ? "project-specific" : "all projects"} · queue pull every ${pollIntervalMinutes} min · caps API ${apiWorkers}/Web ${webWorkers}/Android ${androidWorkers} · ${String(activeWebEngine).toUpperCase()} web · video ${String(config.video_mode || "off")}${qairaApiBaseUrl ? ` · QAira API ${qairaApiBaseUrl}` : ""}`
    };
  }

  if (integration.type === "cloudrun") {
    const provider = typeof config.provider === "string" ? config.provider : "browserstack";
    const browser = typeof config.browser === "string" ? config.browser : "Chrome";
    const os = typeof config.os === "string" ? config.os : "Windows";
    const deviceName = typeof config.device_name === "string" ? config.device_name : "";

    return {
      primary: integration.base_url || (typeof config.remote_url === "string" ? config.remote_url : "Remote hub not set"),
      secondary: `${provider} · ${deviceName ? `${deviceName} · ` : ""}${browser} on ${os}`
    };
  }

  if (integration.type === "ops") {
    return {
      primary: integration.base_url || "Uses active Test Engine host",
      secondary: `${typeof config.project_id === "string" && config.project_id.trim() ? "project-specific" : "all projects"} · ${typeof config.events_path === "string" ? config.events_path : "/api/v1/events"}`
    };
  }

  return {
    primary: typeof config.client_id === "string" ? config.client_id : "Client ID not set",
    secondary: "Used on the login page for Google sign-in"
  };
}

function IntegrationReadOnlyDetails({
  integration,
  definitions
}: {
  integration: Integration;
  definitions: IntegrationTypeDefinition[];
}) {
  const summary = getIntegrationSummary(integration, definitions);
  const configEntries = Object.entries(integration.config || {}).filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <div className="detail-stack">
      <div className="empty-state compact integration-helper">
        Members can use this active integration from QAira workflows. Secrets are masked and connection changes stay with admins.
      </div>
      <div className="integration-readable-grid">
        <article className="integration-readable-card">
          <span className="integration-readable-label">Name</span>
          <strong className="integration-readable-value">{integration.name}</strong>
        </article>
        <article className="integration-readable-card">
          <span className="integration-readable-label">Type</span>
          <strong className="integration-readable-value">{getIntegrationTypeLabel(integration.type, definitions)}</strong>
        </article>
        <article className="integration-readable-card">
          <span className="integration-readable-label">Status</span>
          <strong className="integration-readable-value">{integration.is_active ? "Active" : "Inactive"}</strong>
        </article>
        <article className="integration-readable-card">
          <span className="integration-readable-label">Summary</span>
          <strong className="integration-readable-value">{summary.primary}</strong>
        </article>
      </div>
      {configEntries.length ? (
        <div className="integration-readable-grid">
          {configEntries.map(([key, value]) => (
            <article className="integration-readable-card" key={key}>
              <span className="integration-readable-label">{key.replace(/_/g, " ")}</span>
              <strong className="integration-readable-value">{String(value)}</strong>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function IntegrationsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const domainMetadataQuery = useDomainMetadata();
  const integrationTypeDefinitions = useMemo(
    () => ((domainMetadataQuery.data?.integrations.types || []) as IntegrationTypeDefinition[]).filter((definition) => definition.value !== "jira"),
    [domainMetadataQuery.data]
  );
  const defaultIntegrationType = (domainMetadataQuery.data?.integrations.default_type || DEFAULT_INTEGRATION_TYPE) as Integration["type"];
  const emptyDraft = useMemo(
    () => buildEmptyDraft(integrationTypeDefinitions, defaultIntegrationType),
    [defaultIntegrationType, integrationTypeDefinitions]
  );
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [integrationCatalogViewMode, setIntegrationCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const [selectedIntegrationTypeFilter, setSelectedIntegrationTypeFilter] = useState<IntegrationTypeFilter>("all");
  const [selectedActionIntegrationIds, setSelectedActionIntegrationIds] = useState<string[]>([]);
  const [integrationSearch, setIntegrationSearch] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [draft, setDraft] = useState<IntegrationDraft>(emptyDraft);
  const [testConnectionSummary, setTestConnectionSummary] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.integrations.list(),
    enabled: Boolean(session)
  });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
    enabled: Boolean(session)
  });

  const createIntegration = useMutation({ mutationFn: api.integrations.create });
  const testIntegrationConnection = useMutation({ mutationFn: api.integrations.testConnection });
  const importIntegrations = useMutation({ mutationFn: api.integrations.import });
  const updateIntegration = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof api.integrations.update>[1] }) =>
      api.integrations.update(id, input)
  });
  const deleteIntegration = useMutation({ mutationFn: api.integrations.delete });

  const integrations = integrationsQuery.data || [];
  const projects = projectsQuery.data || [];
  const isIntegrationCatalogLoading = integrationsQuery.isLoading;
  const integrationTypeOptions = INTEGRATION_CATEGORY_DEFINITIONS;
  const searchFilteredIntegrations = useMemo(() => {
    const normalizedSearch = integrationSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return integrations;
    }

    return integrations.filter((integration) => {
      const summary = getIntegrationSummary(integration, integrationTypeDefinitions);

      return [
        integration.id,
        integration.name,
        integration.type,
        getIntegrationCategoryDefinition(getIntegrationCategoryKey(integration.type))?.label,
        getIntegrationTypeLabel(integration.type, integrationTypeDefinitions),
        integration.base_url,
        integration.model,
        integration.project_key,
        integration.username,
        integration.is_active ? "active" : "inactive",
        summary.primary,
        summary.secondary
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [integrationSearch, integrationTypeDefinitions, integrations]);
  const integrationTypeSections = useMemo(
    () =>
      integrationTypeOptions.map((definition) => {
        const allTypeIntegrations = integrations.filter((integration) => getIntegrationCategoryKey(integration.type) === definition.value);
        const items = searchFilteredIntegrations.filter((integration) => getIntegrationCategoryKey(integration.type) === definition.value);

        return {
          ...definition,
          activeCount: allTypeIntegrations.filter((integration) => integration.is_active).length,
          items,
          totalCount: allTypeIntegrations.length
        };
      }),
    [integrationTypeOptions, integrations, searchFilteredIntegrations]
  );
  const visibleIntegrationSections = useMemo(
    () =>
      selectedIntegrationTypeFilter === "all"
        ? integrationTypeSections.filter((section) => section.items.length)
        : integrationTypeSections.filter((section) => section.value === selectedIntegrationTypeFilter),
    [integrationTypeSections, selectedIntegrationTypeFilter]
  );
  const filteredIntegrations = useMemo(
    () =>
      selectedIntegrationTypeFilter === "all"
        ? searchFilteredIntegrations
        : searchFilteredIntegrations.filter((integration) => getIntegrationCategoryKey(integration.type) === selectedIntegrationTypeFilter),
    [searchFilteredIntegrations, selectedIntegrationTypeFilter]
  );
  const visibleIntegrationIds = useMemo(() => filteredIntegrations.map((integration) => integration.id), [filteredIntegrations]);
  const areAllFilteredIntegrationsSelected = visibleIntegrationIds.length > 0 && visibleIntegrationIds.every((id) => selectedActionIntegrationIds.includes(id));
  const integrationListColumns = useMemo<Array<DataTableColumn<Integration>>>(() => [
    {
      key: "name",
      label: "Integration",
      canToggle: false,
      width: 280,
      minWidth: 180,
      sortValue: (integration) => integration.name,
      render: (integration) => {
        const summary = getIntegrationSummary(integration, integrationTypeDefinitions);

        return (
          <div className="data-table-multiline">
            <strong>{integration.name}</strong>
            <span className="data-table-multiline-line">{summary.primary}</span>
          </div>
        );
      }
    },
    {
      key: "type",
      label: "Provider",
      width: 170,
      minWidth: 128,
      sortValue: (integration) => getIntegrationTypeLabel(integration.type, integrationTypeDefinitions),
      render: (integration) => getIntegrationTypeLabel(integration.type, integrationTypeDefinitions)
    },
    {
      key: "status",
      label: "Status",
      width: 120,
      minWidth: 96,
      sortValue: (integration) => integration.is_active ? "active" : "inactive",
      render: (integration) => <StatusBadge value={integration.is_active ? "active" : "inactive"} />
    },
    {
      key: "details",
      label: "Details",
      width: 260,
      minWidth: 160,
      render: (integration) => getIntegrationSummary(integration, integrationTypeDefinitions).secondary
    }
  ], [integrationTypeDefinitions]);
  const selectedIntegration = useMemo(
    () => integrations.find((item) => item.id === selectedIntegrationId) || null,
    [integrations, selectedIntegrationId]
  );
  const activeIntegrationCount = integrations.filter((item) => item.is_active).length;
  const isAdmin = session?.user.role === "admin";
  const isLlm = draft.type === "llm";
  const isEmail = draft.type === "email";
  const isGoogle = draft.type === "google_auth";
  const isGoogleDrive = draft.type === "google_drive";
  const isGithub = draft.type === "github";
  const isTestEngine = draft.type === "testengine";
  const isCloudRun = draft.type === "cloudrun";
  const isOps = draft.type === "ops";
  const draftCategoryKey = getIntegrationCategoryKey(draft.type);
  const draftProviderOptions = useMemo(
    () => getIntegrationProvidersForCategory(draftCategoryKey, integrationTypeDefinitions),
    [draftCategoryKey, integrationTypeDefinitions]
  );
  const emailDefaults = getIntegrationTypeDefinition("email", integrationTypeDefinitions)?.defaults || {};
  const llmDefaults = getIntegrationTypeDefinition("llm", integrationTypeDefinitions)?.defaults || {};
  const defaultEmailSender = typeof emailDefaults.sender_email === "string" ? emailDefaults.sender_email : "";
  const defaultEmailSenderName = typeof emailDefaults.sender_name === "string" ? emailDefaults.sender_name : "";
  const defaultLlmBaseUrl = typeof llmDefaults.base_url === "string" ? llmDefaults.base_url : "";
  const derivedSeleniumGridUrl = useMemo(() => {
    if (!draft.base_url.trim()) {
      return "";
    }

    try {
      const parsed = new URL(draft.base_url.trim());
      parsed.port = "4444";
      parsed.pathname = "/wd/hub";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return "";
    }
  }, [draft.base_url]);
  const derivedTestEngineLiveViewUrl = useMemo(
    () => buildTestEngineLiveViewUrl(draft.base_url, draft.engine_active_web_engine),
    [draft.base_url, draft.engine_active_web_engine]
  );
  const testEngineHealthUrl = useMemo(
    () => buildReadableIntegrationUrl(draft.base_url, "/health"),
    [draft.base_url]
  );
  const testEngineCapabilitiesUrl = useMemo(
    () => buildReadableIntegrationUrl(draft.base_url, "/api/v1/capabilities"),
    [draft.base_url]
  );
  const availableTestEngineIntegrations = useMemo(
    () => integrations.filter((integration) => integration.type === "testengine" && integration.is_active),
    [integrations]
  );
  const resolvedOpsEngineIntegration = useMemo(() => {
    if (draft.type !== "ops") {
      return null;
    }

    const scopedProjectId = draft.ops_project_id.trim();

    if (scopedProjectId) {
      const projectScoped = availableTestEngineIntegrations.find(
        (integration) => integration.config?.project_id === scopedProjectId
      );

      if (projectScoped) {
        return projectScoped;
      }
    }

    return availableTestEngineIntegrations.find((integration) => !String(integration.config?.project_id || "").trim()) || null;
  }, [availableTestEngineIntegrations, draft.ops_project_id, draft.type]);
  const resolvedOpsEngineHost = resolvedOpsEngineIntegration?.base_url || "";
  const opsHealthUrl = useMemo(
    () => buildReadableIntegrationBrowserUrl(resolvedOpsEngineIntegration, draft.ops_health_path),
    [draft.ops_health_path, resolvedOpsEngineIntegration]
  );
  const opsEventsUrl = useMemo(
    () => buildReadableIntegrationBrowserUrl(resolvedOpsEngineIntegration, draft.ops_events_path),
    [draft.ops_events_path, resolvedOpsEngineIntegration]
  );
  const opsBoardUrl = useMemo(
    () => buildReadableIntegrationBrowserUrl(resolvedOpsEngineIntegration, "/ops-telemetry"),
    [resolvedOpsEngineIntegration]
  );
  const opsEmitSummary = useMemo(
    () =>
      [
        draft.ops_emit_step_events ? "steps" : null,
        draft.ops_emit_case_events ? "cases" : null,
        draft.ops_emit_suite_events ? "suites" : null,
        draft.ops_emit_run_events ? "runs" : null
      ].filter(Boolean).join(", ") || "No execution events enabled",
    [
      draft.ops_emit_case_events,
      draft.ops_emit_run_events,
      draft.ops_emit_step_events,
      draft.ops_emit_suite_events
    ]
  );

  const showSuccess = (text: string) => {
    setMessageTone("success");
    setMessage(text);
  };

  const showError = (error: unknown, fallback: string) => {
    setMessageTone("error");
    setMessage(error instanceof Error ? error.message : fallback);
  };

  useEffect(() => {
    if (isCreating) {
      return;
    }

    if (!selectedIntegrationId) {
      setDraft(emptyDraft);
      return;
    }

    if (selectedIntegration) {
      setDraft(getDraftFromIntegration(selectedIntegration, integrationTypeDefinitions, defaultIntegrationType));
      return;
    }

    setSelectedIntegrationId("");
    setDraft(emptyDraft);
  }, [defaultIntegrationType, emptyDraft, integrationTypeDefinitions, isCreating, selectedIntegration, selectedIntegrationId]);

  useEffect(() => {
    setTestConnectionSummary("");
  }, [draft.type, draft.base_url, draft.engine_project_id, draft.ops_project_id, draft.ops_events_path, draft.ops_health_path]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["integrations"] });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const resolvedApiKey = isCloudRun ? draft.cloud_run_access_key : draft.api_key;
      const resolvedBaseUrl = isCloudRun ? draft.cloud_run_remote_url || draft.base_url : draft.base_url;
      const resolvedUsername = isCloudRun ? draft.cloud_run_username : draft.username;
      const input = {
        type: draft.type,
        name: draft.name.trim(),
        base_url: resolvedBaseUrl.trim() || undefined,
        api_key: resolvedApiKey.trim() && !isMaskedSecretValue(resolvedApiKey) ? resolvedApiKey.trim() : undefined,
        model: draft.model.trim() || undefined,
        project_key: draft.project_key.trim() || undefined,
        username: resolvedUsername.trim() || undefined,
        config: buildIntegrationConfig(draft, integrationTypeDefinitions),
        is_active: draft.is_active
      };

      if (isCreating || !selectedIntegration) {
        const response = await createIntegration.mutateAsync(input);
        setSelectedIntegrationId(response.id);
        setSelectedIntegrationTypeFilter(getIntegrationCategoryKey(input.type));
        setIsCreating(false);
        showSuccess("Integration created.");
      } else {
        await updateIntegration.mutateAsync({
          id: selectedIntegration.id,
          input
        });
        setSelectedIntegrationTypeFilter(getIntegrationCategoryKey(input.type));
        showSuccess("Integration updated.");
      }

      await refresh();
    } catch (error) {
      showError(error, "Unable to save integration");
    }
  };

  const handleDelete = async () => {
    if (!selectedIntegration || !(await confirmDelete({ message: `Delete integration "${selectedIntegration.name}"?` }))) {
      return;
    }

    try {
      await deleteIntegration.mutateAsync(selectedIntegration.id);
      setSelectedIntegrationId("");
      setDraft(emptyDraft);
      setIsCreating(false);
      showSuccess("Integration deleted.");
      await refresh();
    } catch (error) {
      showError(error, "Unable to delete integration");
    }
  };

  const handleExportIntegrations = async () => {
    try {
      const payload = await api.integrations.export();
      const transactionId = payload.transaction_id;
      const exportPayload = {
        version: payload.version,
        exported_at: payload.exported_at,
        integrations: payload.integrations
      };
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `qaira-integrations-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      showSuccess(`Integrations exported. TestOps recorded the export${transactionId ? ` (${transactionId.slice(0, 8)})` : ""}.`);
    } catch (error) {
      showError(error, "Unable to export integrations");
    }
  };

  const handleImportIntegrationFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as { integrations?: Integration[] } | Integration[];
      const integrationsToImport = Array.isArray(parsed) ? parsed : parsed.integrations;

      if (!Array.isArray(integrationsToImport)) {
        throw new Error("Import file must contain an integrations array");
      }

      const result = await importIntegrations.mutateAsync({ integrations: integrationsToImport });
      const failureCopy = result.failed ? ` ${result.failed} failed.` : "";
      showSuccess(`Integrations imported in TestOps${result.transaction_id ? ` (${result.transaction_id.slice(0, 8)})` : ""}: ${result.imported} new, ${result.updated} updated.${failureCopy}`);
      await refresh();
    } catch (error) {
      showError(error, "Unable to import integrations");
    }
  };

  const openCreateForm = () => {
    const preferredType = getIntegrationCategoryDefinition(selectedIntegrationTypeFilter)?.defaultProvider || defaultIntegrationType;
    setIsCreating(true);
    setSelectedIntegrationId("");
    setDraft(buildEmptyDraft(integrationTypeDefinitions, preferredType));
  };

  const closeIntegrationWorkspace = () => {
    setSelectedIntegrationId("");
    setIsCreating(false);
    setDraft(emptyDraft);
  };

  const handleSelectIntegrationType = (nextType: IntegrationTypeFilter) => {
    setSelectedIntegrationTypeFilter(nextType);
    setSelectedActionIntegrationIds([]);

    if (nextType !== "all" && selectedIntegration && getIntegrationCategoryKey(selectedIntegration.type) !== nextType) {
      setSelectedIntegrationId("");
      setIsCreating(false);
      setDraft(emptyDraft);
    }
  };

  const handleTestConnection = async () => {
    try {
      const result = await testIntegrationConnection.mutateAsync({
        type: draft.type,
        base_url: draft.base_url.trim() || undefined,
        api_key: draft.api_key.trim() && !isMaskedSecretValue(draft.api_key) ? draft.api_key.trim() : undefined,
        config: buildIntegrationConfig(draft, integrationTypeDefinitions)
      });
      if (result.type === "ops") {
        const summary = `${result.service} responded in ${result.latency_ms} ms from ${result.base_url}. Health ${result.health_url}. Events ${result.events_url}. Board ${result.board_url}.`;
        setTestConnectionSummary(summary);
        showSuccess(`OPS connection verified. ${result.service} · ${result.events_path} · board ready.`);
      } else {
        const supportedStepTypes = result.supported_step_types.length
          ? result.supported_step_types.join(", ")
          : "not reported";
        const supportedWebEngines = result.supported_web_engines.length
          ? result.supported_web_engines.join(", ")
          : "not reported";
        const compatibility = result.qaira_result_log_compatibility
          ? ` Logs ${result.qaira_result_log_compatibility}.`
          : "";
        const summary = `${result.service} responded in ${result.latency_ms} ms from ${result.base_url}. Runner ${result.runner}, scope ${result.execution_scope}, supported steps ${supportedStepTypes}, web engines ${supportedWebEngines}.${compatibility}`;

        setTestConnectionSummary(summary);
        showSuccess(`Test Engine connection verified. ${result.runner} · ${supportedStepTypes} · ${supportedWebEngines}.`);
      }
    } catch (error) {
      setTestConnectionSummary("");
      showError(error, `Unable to verify ${isOps ? "OPS" : "Test Engine"} connection`);
    }
  };

  const integrationActions = isAdmin ? (
    <div className="integration-header-actions">
      <input
        accept="application/json,.json"
        className="visually-hidden"
        onChange={(event) => void handleImportIntegrationFile(event)}
        ref={importInputRef}
        type="file"
      />
      <button className="ghost-button" disabled={!integrations.length} onClick={() => void handleExportIntegrations()} type="button">
        <ExportIcon />
        Export
      </button>
      <button className="ghost-button" disabled={importIntegrations.isPending} onClick={() => importInputRef.current?.click()} type="button">
        <ImportIcon />
        Import
      </button>
      <button
        className="primary-button"
        onClick={openCreateForm}
        type="button"
      >
        <PlugIcon />
        New Integration
      </button>
    </div>
  ) : null;

  const renderIntegrationTile = (integration: Integration) => {
    const summary = getIntegrationSummary(integration, integrationTypeDefinitions);

    return (
      <button
        key={integration.id}
        className={selectedIntegrationId === integration.id ? "record-card tile-card is-active" : "record-card tile-card"}
        onClick={() => {
          setSelectedIntegrationId(integration.id);
          setIsCreating(false);
        }}
        type="button"
      >
        <div className="tile-card-main">
          <div className="tile-card-select-row" onClick={(event) => event.stopPropagation()}>
            <label className="checkbox-field">
              <input
                aria-label={`Select ${integration.name}`}
                checked={selectedActionIntegrationIds.includes(integration.id)}
                onChange={() =>
                  setSelectedActionIntegrationIds((current) =>
                    current.includes(integration.id)
                      ? current.filter((id) => id !== integration.id)
                      : [...current, integration.id]
                  )
                }
                type="checkbox"
              />
              <span className="sr-only">Select integration</span>
            </label>
          </div>
          <div className="tile-card-header">
            <span className="integration-type-badge">{getIntegrationBadgeIcon(integration.type)}</span>
            <div className="tile-card-title-group">
              <strong>{integration.name}</strong>
              <span className="tile-card-kicker">{getIntegrationTypeLabel(integration.type, integrationTypeDefinitions)}</span>
            </div>
            <TileCardStatusIndicator title={integration.is_active ? "Active" : "Inactive"} tone={integration.is_active ? "success" : "neutral"} />
          </div>
          <p className="tile-card-description">{summary.primary}</p>
          <div className="integration-card-footer">
            <StatusBadge value={integration.is_active ? "active" : "inactive"} />
            <span className="count-pill">{summary.secondary}</span>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className={embedded ? "admin-embedded-page integrations-admin-page" : "page-content"}>
      {confirmationDialog}
      <ToastMessage message={message} onDismiss={() => setMessage("")} tone={messageTone === "error" ? "error" : "success"} />

      {!embedded ? (
        <PageHeader
          eyebrow="Administration"
          title="Integrations"
          description="Manage the external systems QAira uses for AI generation, Jira sync, Test Engine run handoff, OPS telemetry, backup automation, Google sign-in, and email verification delivery."
          meta={[
            { label: "Configured", value: integrations.length },
            { label: "Active", value: activeIntegrationCount },
            { label: "Selected type", value: selectedIntegrationTypeFilter === "all" ? "All types" : getIntegrationCategoryDefinition(selectedIntegrationTypeFilter)?.label || "None" }
          ]}
          actions={integrationActions}
        />
      ) : null}

      <WorkspaceMasterDetail
          browseView={(
            <Panel
              title="Integrations"
	              titleVariant="eyebrow"
	              subtitle="Review configured connections grouped by integration type, then open one profile into a focused editor."
	            >
	              <div className="design-list-toolbar integration-catalog-toolbar">
	                <CatalogSearchFilter
	                  activeFilterCount={(integrationSearch.trim() ? 1 : 0) + (selectedIntegrationTypeFilter !== "all" ? 1 : 0)}
	                  ariaLabel="Search integrations"
	                  onChange={setIntegrationSearch}
	                  placeholder="Search integrations"
	                  subtitle="Search by name, provider type, status, URL, model, project key, or user."
	                  title="Integration filters"
	                  type="search"
	                  value={integrationSearch}
	                >
	                  <div className="catalog-filter-grid">
	                    <div className="integration-filter-type-list" role="tablist" aria-label="Integration type sections">
	                      <button
	                        aria-selected={selectedIntegrationTypeFilter === "all"}
	                        className={selectedIntegrationTypeFilter === "all" ? "is-active" : ""}
	                        onClick={() => handleSelectIntegrationType("all")}
	                        role="tab"
	                        type="button"
	                      >
	                        <span className="integration-filter-type-icon"><PlugIcon /></span>
	                        <span>
	                          <strong>All types</strong>
	                          <small>{integrations.length} configured · {activeIntegrationCount} active</small>
	                        </span>
	                      </button>
	                      {integrationTypeOptions.map((definition) => {
	                        const section = integrationTypeSections.find((item) => item.value === definition.value);
	                        const totalCount = section?.totalCount || 0;
	                        const activeCount = section?.activeCount || 0;

	                        return (
	                          <button
	                            aria-selected={selectedIntegrationTypeFilter === definition.value}
	                            className={selectedIntegrationTypeFilter === definition.value ? "is-active" : ""}
	                            key={definition.value}
	                            onClick={() => handleSelectIntegrationType(definition.value)}
	                            role="tab"
	                            type="button"
	                          >
	                            <span className="integration-filter-type-icon">{getIntegrationBadgeIcon(definition.defaultProvider)}</span>
	                            <span>
	                              <strong>{definition.label}</strong>
	                              <small>{totalCount} configured · {activeCount} active</small>
	                            </span>
	                          </button>
	                        );
	                      })}
	                    </div>
	                    <div className="catalog-filter-actions">
	                      <button
	                        className="ghost-button"
	                        disabled={!integrationSearch.trim() && selectedIntegrationTypeFilter === "all"}
	                        onClick={() => {
	                          setIntegrationSearch("");
	                          handleSelectIntegrationType("all");
	                        }}
	                        type="button"
	                      >
	                        Clear filters
	                      </button>
	                    </div>
	                  </div>
                </CatalogSearchFilter>
                <CatalogSelectionControls
                  allSelected={areAllFilteredIntegrationsSelected}
                  canSelectAll={Boolean(visibleIntegrationIds.length)}
                  onClear={() => setSelectedActionIntegrationIds([])}
                  onSelectAll={() => setSelectedActionIntegrationIds((current) => Array.from(new Set([...current, ...visibleIntegrationIds])))}
                  selectedCount={selectedActionIntegrationIds.length}
                />
                <CatalogViewToggle onChange={setIntegrationCatalogViewMode} value={integrationCatalogViewMode} />
                {embedded && integrationActions ? <div className="catalog-toolbar-actions">{integrationActions}</div> : null}
              </div>
              {isIntegrationCatalogLoading ? <TileCardSkeletonGrid /> : null}
              {!isIntegrationCatalogLoading && visibleIntegrationSections.length ? (
                <div className="integration-type-section-stack">
                  {visibleIntegrationSections.map((section) => (
                    <section className="integration-type-section" key={section.value}>
                      <div className="integration-type-section-header">
                        <span className="integration-type-section-icon">{getIntegrationBadgeIcon(section.defaultProvider)}</span>
                        <div>
                          <strong>{section.label}</strong>
                          <span>{section.description || "Configured external system profiles for this integration type."}</span>
                        </div>
                        <div className="integration-type-section-meta">
                          <span className="count-pill">{section.items.length} shown</span>
                          <span className="count-pill">{section.totalCount} total</span>
                          <span className="count-pill">{section.activeCount} active</span>
                        </div>
                      </div>

                      {section.items.length && integrationCatalogViewMode === "tile" ? (
                        <div className="tile-browser-grid integration-type-grid">
                          {section.items.map((integration) => renderIntegrationTile(integration))}
                        </div>
                      ) : null}

                      {section.items.length && integrationCatalogViewMode === "list" ? (
                        <DataTable
                          columns={integrationListColumns}
                          enableColumnResize
                          enableHeaderColumnReorder
                          emptyMessage={`No ${section.label} integrations match the current search.`}
                          getRowClassName={(integration) => (selectedIntegrationId === integration.id ? "is-active-row" : "")}
                          getRowKey={(integration) => integration.id}
                          hideToolbarCopy
                          onRowClick={(integration) => {
                            setSelectedIntegrationId(integration.id);
                            setIsCreating(false);
                          }}
                          rows={section.items}
                          storageKey={`qaira:integrations:list-columns:${section.value}`}
                        />
                      ) : null}

                      {!section.items.length ? (
                        <div className="empty-state compact">No {section.label} integrations match the current search.</div>
                      ) : null}
                    </section>
                  ))}
                </div>
              ) : null}
              {!isIntegrationCatalogLoading && !integrations.length ? <div className="empty-state compact">No integrations configured yet.</div> : null}
              {!isIntegrationCatalogLoading && integrations.length > 0 && !visibleIntegrationSections.length && !filteredIntegrations.length ? <div className="empty-state compact">No integrations match the current search.</div> : null}
            </Panel>
          )}
          detailView={(
            <Panel
              actions={<WorkspaceBackButton label="Back to integration tiles" onClick={closeIntegrationWorkspace} />}
              title={isCreating ? "New integration" : selectedIntegration ? "Integration details" : "Integration editor"}
              subtitle="Store the credentials and provider settings QAira needs to call external systems and power secure authentication flows."
            >
              {!isAdmin && selectedIntegration ? (
                <IntegrationReadOnlyDetails definitions={integrationTypeDefinitions} integration={selectedIntegration} />
              ) : isCreating || selectedIntegration ? (
                <form className="form-grid" onSubmit={(event) => void handleSave(event)}>
                <div className="record-grid">
                  <FormField label="Integration type">
                    <select
                      value={draftCategoryKey}
                      onChange={(event) => {
                        const nextCategory = event.target.value as IntegrationCategoryKey;
                        const nextType = getIntegrationCategoryDefinition(nextCategory)?.defaultProvider || getIntegrationProvidersForCategory(nextCategory, integrationTypeDefinitions)[0]?.value || DEFAULT_INTEGRATION_TYPE;
                        setSelectedIntegrationTypeFilter(nextCategory);
                        setDraft((current) =>
                          applyDraftDefaultsForType(nextType, current, integrationTypeDefinitions)
                        );
                      }}
                    >
                      {INTEGRATION_CATEGORY_DEFINITIONS.map((definition) => (
                        <option key={definition.value} value={definition.value}>{definition.label}</option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Provider">
                    <select
                      value={draft.type}
                      onChange={(event) => {
                        const nextType = event.target.value as Integration["type"];
                        setSelectedIntegrationTypeFilter(getIntegrationCategoryKey(nextType));
                        setDraft((current) =>
                          applyDraftDefaultsForType(nextType, current, integrationTypeDefinitions)
                        );
                      }}
                    >
                      {draftProviderOptions.map((definition) => (
                        <option key={definition.value} value={definition.value}>{definition.label}</option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="record-grid">
                  <FormField label="Name">
                    <input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                  </FormField>
                </div>

                {isLlm ? (
                  <>
                    <div className="record-grid">
                      <FormField label="Base URL">
                        <input
                          placeholder={defaultLlmBaseUrl || "https://api.openai.com/v1"}
                          value={draft.base_url}
                          onChange={(event) => setDraft((current) => ({ ...current, base_url: event.target.value }))}
                        />
                      </FormField>

                      <FormField label="Model">
                        <input
                          placeholder="gpt-5.4-mini"
                          value={draft.model}
                          onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="API Key">
                        <input type="password" value={draft.api_key} onChange={(event) => setDraft((current) => ({ ...current, api_key: event.target.value }))} />
                      </FormField>
                    </div>
                  </>
                ) : null}

                {isEmail ? (
                  <>
                    <div className="empty-state compact integration-helper">
                      QAira sends signup and forgot-password verification codes through this SMTP profile. Set the sender email to <strong>{defaultEmailSender || "your sender mailbox"}</strong> when that mailbox is configured on your mail provider.
                    </div>

                    <div className="record-grid">
                      <FormField label="SMTP Host">
                        <input
                          placeholder="smtp.zoho.in"
                          value={draft.smtp_host}
                          onChange={(event) => setDraft((current) => ({ ...current, smtp_host: event.target.value }))}
                        />
                      </FormField>

                      <FormField label="SMTP Port">
                        <input
                          inputMode="numeric"
                          placeholder="587"
                          value={draft.smtp_port}
                          onChange={(event) => setDraft((current) => ({ ...current, smtp_port: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="SMTP Username / Email">
                        <input
                          placeholder={defaultEmailSender}
                          value={draft.username}
                          onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))}
                        />
                      </FormField>

                      <FormField label="SMTP Password">
                        <input
                          type="password"
                          value={draft.smtp_password}
                          onChange={(event) => setDraft((current) => ({ ...current, smtp_password: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Sender Email">
                        <input
                          placeholder={defaultEmailSender}
                          value={draft.sender_email}
                          onChange={(event) => setDraft((current) => ({ ...current, sender_email: event.target.value }))}
                        />
                      </FormField>

                      <FormField label="Sender Name">
                        <input
                          placeholder={defaultEmailSenderName}
                          value={draft.sender_name}
                          onChange={(event) => setDraft((current) => ({ ...current, sender_name: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <label className="checkbox-field">
                      <input
                        checked={draft.smtp_secure}
                        onChange={(event) => setDraft((current) => ({ ...current, smtp_secure: event.target.checked }))}
                        type="checkbox"
                      />
                      <span>Use secure SMTP connection</span>
                    </label>
                  </>
                ) : null}

                {isGoogle ? (
                  <>
                    <div className="empty-state compact integration-helper">
                      Add the Google OAuth web client ID that should power the sign-in button on the QAira login page.
                    </div>

                    <div className="record-grid">
                      <FormField label="Google Client ID">
                        <input
                          placeholder="1234567890-abcdef.apps.googleusercontent.com"
                          value={draft.google_client_id}
                          onChange={(event) => setDraft((current) => ({ ...current, google_client_id: event.target.value }))}
                        />
                      </FormField>
                    </div>
                  </>
                ) : null}

                {(isGoogleDrive || isGithub) ? (
                  <>
                    <div className="empty-state compact integration-helper">
                      {isGoogleDrive
                        ? "Store a Google access token and Drive folder so QAira can upload a compressed project artifact with requirements and test case exports."
                        : "Store a GitHub access token and target repository so QAira can sync test-case-linked automation code and manifests asynchronously."}
                    </div>

                    <div className="record-grid">
                      <FormField label="Project">
                        <select
                          value={draft.sync_project_id}
                          onChange={(event) => setDraft((current) => ({ ...current, sync_project_id: event.target.value }))}
                        >
                          <option value="">Select a project</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                          ))}
                        </select>
                      </FormField>

                      <FormField label="Schedule">
                        <select
                          value={draft.sync_schedule_mode}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              sync_schedule_mode: event.target.value as IntegrationDraft["sync_schedule_mode"]
                            }))
                          }
                        >
                          <option value="manual">Manual only</option>
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label={isGoogleDrive ? "Google Access Token" : "GitHub Access Token"}>
                        <input
                          type="password"
                          value={draft.api_key}
                          onChange={(event) => setDraft((current) => ({ ...current, api_key: event.target.value }))}
                        />
                      </FormField>

                      {isGoogleDrive ? (
                        <FormField label="Drive Folder ID">
                          <input
                            placeholder="1AbCdEfGh..."
                            value={draft.google_drive_folder_id}
                            onChange={(event) => setDraft((current) => ({ ...current, google_drive_folder_id: event.target.value }))}
                          />
                        </FormField>
                      ) : (
                        <FormField label="GitHub API Base URL">
                          <input
                            placeholder="https://api.github.com"
                            value={draft.base_url}
                            onChange={(event) => setDraft((current) => ({ ...current, base_url: event.target.value }))}
                          />
                        </FormField>
                      )}
                    </div>

                    {isGithub ? (
                      <>
                        <div className="record-grid">
                          <FormField label="Repository Owner">
                            <input
                              placeholder="your-org"
                              value={draft.github_owner}
                              onChange={(event) => setDraft((current) => ({ ...current, github_owner: event.target.value }))}
                            />
                          </FormField>

                          <FormField label="Repository Name">
                            <input
                              placeholder="qa-automation"
                              value={draft.github_repo}
                              onChange={(event) => setDraft((current) => ({ ...current, github_repo: event.target.value }))}
                            />
                          </FormField>
                        </div>

                        <div className="record-grid">
                          <FormField label="Branch">
                            <input
                              placeholder="main"
                              value={draft.github_branch}
                              onChange={(event) => setDraft((current) => ({ ...current, github_branch: event.target.value }))}
                            />
                          </FormField>

                          <FormField label="Directory">
                            <input
                              placeholder="qaira-sync"
                              value={draft.github_directory}
                              onChange={(event) => setDraft((current) => ({ ...current, github_directory: event.target.value }))}
                            />
                          </FormField>
                        </div>
                      </>
                    ) : null}
	                  </>
	                ) : null}
	
	                {isCloudRun ? (
	                  <>
	                    <div className="empty-state compact integration-helper">
	                      Store cloud browser and device provider credentials independently from project records. These settings remain in Admin Space and can be reused across runs.
	                    </div>

	                    <div className="record-grid">
	                      <FormField label="Provider">
	                        <select
	                          value={draft.cloud_run_provider}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_provider: event.target.value as IntegrationDraft["cloud_run_provider"] }))}
	                        >
	                          <option value="browserstack">BrowserStack</option>
	                          <option value="lambdatest">LambdaTest</option>
	                          <option value="saucelabs">Sauce Labs</option>
	                          <option value="crossbrowser">CrossBrowser</option>
	                          <option value="other">Other</option>
	                        </select>
	                      </FormField>

	                      <FormField label="Project Scope">
	                        <select
	                          value={draft.cloud_run_project_id}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_project_id: event.target.value }))}
	                        >
	                          <option value="">All projects (default)</option>
	                          {projects.map((project) => (
	                            <option key={project.id} value={project.id}>{project.name}</option>
	                          ))}
	                        </select>
	                      </FormField>
	                    </div>

	                    <div className="record-grid">
	                      <FormField label="Remote Hub URL">
	                        <input
	                          placeholder="https://hub.browserstack.com/wd/hub"
	                          value={draft.cloud_run_remote_url}
	                          onChange={(event) => {
	                            const remoteUrl = event.target.value;
	                            setDraft((current) => ({ ...current, cloud_run_remote_url: remoteUrl, base_url: remoteUrl }));
	                          }}
	                        />
	                      </FormField>

	                      <FormField label="Username">
	                        <input
	                          value={draft.cloud_run_username}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_username: event.target.value }))}
	                        />
	                      </FormField>

	                      <FormField label="Access Key">
	                        <input
	                          type="password"
	                          value={draft.cloud_run_access_key}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_access_key: event.target.value }))}
	                        />
	                      </FormField>
	                    </div>

	                    <div className="record-grid">
	                      <FormField label="Browser">
	                        <input
	                          placeholder="Chrome"
	                          value={draft.cloud_run_browser}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_browser: event.target.value }))}
	                        />
	                      </FormField>

	                      <FormField label="OS">
	                        <input
	                          placeholder="Windows"
	                          value={draft.cloud_run_os}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_os: event.target.value }))}
	                        />
	                      </FormField>
	                    </div>

	                    <div className="record-grid">
	                      <FormField label="Device name">
	                        <input
	                          placeholder="Pixel 8 or iPhone 15"
	                          value={draft.cloud_run_device_name}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_device_name: event.target.value }))}
	                        />
	                      </FormField>

	                      <FormField label="Platform version">
	                        <input
	                          placeholder="14"
	                          value={draft.cloud_run_platform_version}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_platform_version: event.target.value }))}
	                        />
	                      </FormField>
	                    </div>

	                    <div className="record-grid">
	                      <FormField label="Build name">
	                        <input
	                          placeholder="QAira regression"
	                          value={draft.cloud_run_build_name}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_build_name: event.target.value }))}
	                        />
	                      </FormField>

	                      <FormField label="Session name">
	                        <input
	                          placeholder="Manual or automated run"
	                          value={draft.cloud_run_session_name}
	                          onChange={(event) => setDraft((current) => ({ ...current, cloud_run_session_name: event.target.value }))}
	                        />
	                      </FormField>
	                    </div>
	                  </>
	                ) : null}

	                {isTestEngine ? (
	                  <>
                    <div className="empty-state compact integration-helper">
                      QAira remains the only run UI. Configure the Test Engine host and active web engine here. QAira derives the queue, pull-based execution flow, and provider-aware runtime defaults automatically, so you no longer need to manage callback URLs, signing secrets, or engine tokens from this screen.
                    </div>

                    <div className="record-grid">
                      <FormField label="Project Scope">
                        <select
                          value={draft.engine_project_id}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_project_id: event.target.value }))}
                        >
                          <option value="">All projects (default)</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                          ))}
                        </select>
                      </FormField>

                      <FormField label="Engine Host URL">
                        <input
                          placeholder="https://testengine.company.internal"
                          value={draft.base_url}
                          onChange={(event) => {
                            const baseUrl = event.target.value;
                            setDraft((current) => ({
                              ...current,
                              base_url: baseUrl,
                              engine_live_view_url: isAutoDerivedLiveViewUrl(current.engine_live_view_url)
                                ? buildTestEngineLiveViewUrl(baseUrl, current.engine_active_web_engine)
                                : current.engine_live_view_url
                            }));
                          }}
                        />
                      </FormField>

                      <FormField label="QAira API Base URL">
                        <input
                          placeholder="https://qaira.company.internal/api"
                          value={draft.engine_qaira_api_base_url}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_qaira_api_base_url: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Queue Poll Interval (min)">
                        <input
                          inputMode="decimal"
                          min="0.5"
                          placeholder="0.5"
                          step="0.5"
                          type="number"
                          value={draft.engine_queue_poll_interval_minutes}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_queue_poll_interval_minutes: event.target.value }))}
                        />
                      </FormField>

                      <div className="empty-state compact integration-helper">
                        The standalone Test Engine uses this cadence when split API, Web, and Android workers pull queued automation jobs from QAira. Set the engine container's QAIRA_API_BASE_URL to the QAira API URL above, or to the public QAira URL when /api proxying is available.
                      </div>
                    </div>

                    <div className="record-grid">
                      <FormField label="Max API Workers">
                        <input
                          inputMode="numeric"
                          placeholder="10"
                          value={draft.engine_max_api_workers}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_max_api_workers: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Max Web Workers">
                        <input
                          inputMode="numeric"
                          placeholder="5"
                          value={draft.engine_max_web_workers}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_max_web_workers: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Max Android Workers">
                        <input
                          inputMode="numeric"
                          placeholder="2"
                          value={draft.engine_max_android_workers}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_max_android_workers: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Run Timeout (sec)">
                        <input
                          inputMode="numeric"
                          placeholder="1800"
                          value={draft.engine_run_timeout_seconds}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_run_timeout_seconds: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Navigation Wait (ms)">
                        <input
                          inputMode="numeric"
                          placeholder="30000"
                          value={draft.engine_navigation_timeout_ms}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_navigation_timeout_ms: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Action Wait (ms)">
                        <input
                          inputMode="numeric"
                          placeholder="5000"
                          value={draft.engine_action_timeout_ms}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_action_timeout_ms: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Assertion Wait (ms)">
                        <input
                          inputMode="numeric"
                          placeholder="10000"
                          value={draft.engine_assertion_timeout_ms}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_assertion_timeout_ms: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Recovery Wait (ms)">
                        <input
                          inputMode="numeric"
                          placeholder="750"
                          value={draft.engine_recovery_wait_ms}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_recovery_wait_ms: event.target.value }))}
                        />
                      </FormField>
                      <div className="empty-state compact integration-helper">
                        Wait timings are passed into every queued web run and honored by both Playwright and Selenium locators, navigation, assertions, and repair retries.
                      </div>
                    </div>

                    <div className="record-grid">
                      <FormField label="Trace Mode">
                        <select
                          value={draft.engine_trace_mode}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_trace_mode: event.target.value as IntegrationDraft["engine_trace_mode"] }))}
                        >
                          <option value="off">Off</option>
                          <option value="on">On</option>
                          <option value="on-first-retry">On first retry</option>
                          <option value="retain-on-failure">Retain on failure</option>
                        </select>
                      </FormField>
                      <FormField label="Record Video">
                        <select
                          value={draft.engine_video_mode}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_video_mode: event.target.value as IntegrationDraft["engine_video_mode"] }))}
                        >
                          <option value="off">Off</option>
                          <option value="on">On</option>
                          <option value="retain-on-failure">Retain on failure</option>
                        </select>
                      </FormField>
                      <FormField label="Max Video Attachment (MB)">
                        <input
                          inputMode="numeric"
                          placeholder="25"
                          value={draft.engine_max_video_attachment_mb}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_max_video_attachment_mb: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Artifact Retention (days)">
                        <input
                          inputMode="numeric"
                          placeholder="14"
                          value={draft.engine_artifact_retention_days}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_artifact_retention_days: event.target.value }))}
                        />
                      </FormField>
                      <label className="checkbox-field">
                        <input
                          checked={draft.engine_capture_console}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_capture_console: event.target.checked }))}
                          type="checkbox"
                        />
                        <span>Capture console output</span>
                      </label>
                      <label className="checkbox-field">
                        <input
                          checked={draft.engine_capture_network}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_capture_network: event.target.checked }))}
                          type="checkbox"
                        />
                        <span>Capture network events</span>
                      </label>
                    </div>

                    <div className="record-grid">
                      <FormField label="Active Web Engine">
                        <select
                          value={draft.engine_active_web_engine}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              engine_active_web_engine: event.target.value as IntegrationDraft["engine_active_web_engine"],
                              engine_live_view_url: buildTestEngineLiveViewUrl(
                                current.base_url,
                                event.target.value as IntegrationDraft["engine_active_web_engine"]
                              )
                            }))
                          }
                        >
                          <option value="playwright">Playwright</option>
                          <option value="selenium">Selenium Grid</option>
                        </select>
                      </FormField>

                      <div className="empty-state compact integration-helper">
                        {draft.engine_active_web_engine === "selenium"
                          ? (
                            <>
                              Selenium Grid target derives automatically inside the engine stack.
                              <strong>{derivedSeleniumGridUrl || " Enter an engine host URL to preview the derived grid endpoint."}</strong>
                            </>
                          )
                          : (
                            <>
                              Playwright runs inside the Test Engine service container with QAira-managed queue orchestration, result updates, and the provider-aware live session endpoint.
                            </>
                          )}
                      </div>
                    </div>

                    <div className="record-grid">
                      <FormField label="Live Viewer URL">
                        <input
                          placeholder={draft.engine_active_web_engine === "selenium" ? "http://localhost:7900/?autoconnect=1&resize=scale" : "http://localhost:4301/api/v1/live-session?provider=playwright"}
                          value={draft.engine_live_view_url}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_live_view_url: event.target.value }))}
                        />
                      </FormField>

                      <div className="empty-state compact integration-helper">
                        {draft.engine_active_web_engine === "selenium"
                          ? "Selenium runs expose noVNC on port 7900 by default. QAira derives that URL from the engine host unless you override it."
                          : "Playwright runs use the Test Engine live-session endpoint. QAira auto-populates this URL when Playwright is selected."}
                        {derivedTestEngineLiveViewUrl ? <strong>{derivedTestEngineLiveViewUrl}</strong> : null}
                      </div>
                    </div>

                    <div className="record-grid">
                      <FormField label="Mobile Engine URL">
                        <input
                          placeholder="http://mobile-engine:4312"
                          value={draft.engine_mobile_engine_url}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_mobile_engine_url: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Mobile cloud provider">
                        <select
                          value={draft.engine_mobile_cloud_provider}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_mobile_cloud_provider: event.target.value as IntegrationDraft["engine_mobile_cloud_provider"] }))}
                        >
                          <option value="none">None</option>
	                          <option value="saucelabs">Sauce Labs</option>
	                          <option value="lambdatest">LambdaTest</option>
	                          <option value="browserstack">BrowserStack</option>
	                          <option value="crossbrowser">CrossBrowser</option>
	                          <option value="other">Other</option>
                        </select>
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Remote connection URL">
                        <input
                          placeholder="https://user:key@ondemand.us-west-1.saucelabs.com/wd/hub"
                          value={draft.engine_mobile_remote_url}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_mobile_remote_url: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Android app">
                        <input
                          placeholder="storage:filename.apk or /apps/app.apk"
                          value={draft.engine_android_app}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_android_app: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Device name">
                        <input
                          placeholder="Pixel 8"
                          value={draft.engine_mobile_device_name}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_mobile_device_name: event.target.value }))}
                        />
                      </FormField>
                      <FormField label="Platform version">
                        <input
                          placeholder="14"
                          value={draft.engine_mobile_platform_version}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_mobile_platform_version: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <label className="checkbox-field">
                        <input
                          checked={!draft.engine_headless}
                          onChange={(event) => setDraft((current) => ({ ...current, engine_headless: !event.target.checked }))}
                          type="checkbox"
                        />
                        <span>Show browser while web tests run</span>
                      </label>

                      <div className="empty-state compact integration-helper">
                        Headed browser execution is the default so live runs can be watched while automated web cases are pulled from the queue.
                      </div>
                    </div>

                    <div className="record-grid">
                      <div className="empty-state compact integration-helper">
                        Derived automatically after save:
                        <strong> queue pull mode</strong>, <strong>API + web execution scope</strong>, deterministic engine defaults, and QAira-managed queued, running, step, case, suite, and run updates.
                      </div>
                    </div>

                    <div className="integration-readable-grid">
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Hosted at</span>
                        <strong className="integration-readable-value">{draft.base_url.trim() || "Set an engine host URL"}</strong>
                      </article>
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Health endpoint</span>
                        <strong className="integration-readable-value">{testEngineHealthUrl || "Available after a valid host URL is entered"}</strong>
                      </article>
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Capabilities endpoint</span>
                        <strong className="integration-readable-value">{testEngineCapabilitiesUrl || "Available after a valid host URL is entered"}</strong>
                      </article>
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Queue polling</span>
                        <strong className="integration-readable-value">Every {Number.parseFloat(draft.engine_queue_poll_interval_minutes) || 5} min</strong>
                      </article>
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Runtime profile</span>
                        <strong className="integration-readable-value">
                          {`${draft.engine_project_id ? "Project-specific" : "All projects"} · ${String(draft.engine_active_web_engine).toUpperCase()} · ${draft.engine_browser}`}
                        </strong>
                      </article>
                    </div>

                    {testConnectionSummary ? (
                      <div className="inline-message success-message">{testConnectionSummary}</div>
                    ) : null}
                  </>
                ) : null}

                {isOps ? (
                  <>
                    <div className="empty-state compact integration-helper">
                      OPS Telemetry now rides on the active Test Engine host for the selected scope. Configure only the event paths, labels, and which execution events QAira should emit. QAira still sends telemetry best-effort, so a temporary OPS issue will not block the run, and the hosted engine exposes a board at <strong>/ops-telemetry</strong> where operators can filter captured logs by service.
                    </div>

                    <div className="record-grid">
                      <FormField label="Project Scope">
                        <select
                          value={draft.ops_project_id}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_project_id: event.target.value }))}
                        >
                          <option value="">All projects (default)</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>{project.name}</option>
                          ))}
                        </select>
                      </FormField>

                      <div className="empty-state compact integration-helper">
                        <strong>{resolvedOpsEngineHost || "No active Test Engine host available yet."}</strong>
                        <span>
                          {resolvedOpsEngineIntegration
                            ? `Using "${resolvedOpsEngineIntegration.name}" as the transport host for OPS health and event delivery.`
                            : "Create or activate a matching Test Engine integration first so QAira knows where to send OPS telemetry."}
                        </span>
                      </div>
                    </div>

                    <div className="record-grid">
                      <FormField label="Events Path">
                        <input
                          placeholder="/api/v1/events"
                          value={draft.ops_events_path}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_events_path: event.target.value }))}
                        />
                      </FormField>

                      <FormField label="Health Path">
                        <input
                          placeholder="/health"
                          value={draft.ops_health_path}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_health_path: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Timeout (ms)">
                        <input
                          inputMode="numeric"
                          placeholder="4000"
                          value={draft.ops_timeout_ms}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_timeout_ms: event.target.value }))}
                          />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <FormField label="Service Name">
                        <input
                          placeholder="qaira-testengine"
                          value={draft.ops_service_name}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_service_name: event.target.value }))}
                        />
                      </FormField>

                      <FormField label="Environment">
                        <input
                          placeholder="production"
                          value={draft.ops_environment}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_environment: event.target.value }))}
                        />
                      </FormField>
                    </div>

                    <div className="record-grid">
                      <label className="checkbox-field">
                        <input
                          checked={draft.ops_emit_step_events}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_emit_step_events: event.target.checked }))}
                          type="checkbox"
                        />
                        <span>Emit step events</span>
                      </label>

                      <label className="checkbox-field">
                        <input
                          checked={draft.ops_emit_case_events}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_emit_case_events: event.target.checked }))}
                          type="checkbox"
                        />
                        <span>Emit case events</span>
                      </label>
                    </div>

                    <div className="record-grid">
                      <label className="checkbox-field">
                        <input
                          checked={draft.ops_emit_suite_events}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_emit_suite_events: event.target.checked }))}
                          type="checkbox"
                        />
                        <span>Emit suite events</span>
                      </label>

                      <label className="checkbox-field">
                        <input
                          checked={draft.ops_emit_run_events}
                          onChange={(event) => setDraft((current) => ({ ...current, ops_emit_run_events: event.target.checked }))}
                          type="checkbox"
                        />
                        <span>Emit run events</span>
                      </label>
                    </div>

                    <div className="integration-readable-grid">
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Transport host</span>
                        <strong className="integration-readable-value">{resolvedOpsEngineHost || "Activate a matching Test Engine integration first"}</strong>
                      </article>
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Health endpoint</span>
                        <strong className="integration-readable-value">{opsHealthUrl || "Available after a host is resolved"}</strong>
                      </article>
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Event endpoint</span>
                        <strong className="integration-readable-value">{opsEventsUrl || "Available after a host is resolved"}</strong>
                      </article>
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Telemetry board</span>
                        <strong className="integration-readable-value">{opsBoardUrl || "Available after a host is resolved"}</strong>
                      </article>
                      <article className="integration-readable-card">
                        <span className="integration-readable-label">Telemetry profile</span>
                        <strong className="integration-readable-value">
                          {`${draft.ops_service_name || "qaira-testengine"} · ${draft.ops_environment || "production"} · ${opsEmitSummary}`}
                        </strong>
                      </article>
                    </div>

                    {testConnectionSummary ? (
                      <div className="inline-message success-message">{testConnectionSummary}</div>
                    ) : null}
                  </>
                ) : null}

                <label className="checkbox-field">
                  <input
                    checked={draft.is_active}
                    onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Mark as active</span>
                </label>

                <div className="action-row">
                  {(isTestEngine || isOps) ? (
                    <button
                      className="ghost-button"
                      disabled={
                        testIntegrationConnection.isPending
                        || (isTestEngine ? !draft.base_url.trim() : !resolvedOpsEngineHost)
                      }
                      onClick={() => void handleTestConnection()}
                      type="button"
                    >
                      {testIntegrationConnection.isPending ? "Testing connection..." : "Test connection"}
                    </button>
                  ) : null}
                  <button className="primary-button" type="submit">{isCreating ? "Create integration" : "Save integration"}</button>
                  {!isCreating && selectedIntegration ? (
                    <button className="ghost-button danger" onClick={() => void handleDelete()} type="button">
                      Delete integration
                    </button>
                  ) : null}
                </div>
                </form>
              ) : (
                <div className="empty-state compact">Choose an integration tile or create a new one.</div>
              )}
            </Panel>
          )}
          isDetailOpen={isCreating || Boolean(selectedIntegration)}
        />
    </div>
  );
}
