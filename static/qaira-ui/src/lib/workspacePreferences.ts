export type WorkspaceTheme = "light" | "dark";
export type SidebarMode = "expanded" | "collapsed";

export type WorkspacePreferenceUpdate = {
  sidebarMode?: SidebarMode;
  theme?: WorkspaceTheme;
};

export const preferenceStorageKeys = {
  autoExport: "app_auto_export",
  projectAutomationSettings: "qaira.project_automation_settings",
  sidebarCollapsed: "sidebar_collapsed",
  theme: "app_theme"
} as const;

export const PREFERENCES_UPDATED_EVENT = "qaira:preferences-updated";

export function readWorkspaceTheme(): WorkspaceTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const jiraColorMode = document.documentElement.dataset.colorMode;
  if (jiraColorMode === "dark" || jiraColorMode === "light") {
    return jiraColorMode;
  }

  const appliedTheme = document.documentElement.dataset.theme;
  if (appliedTheme === "dark" || appliedTheme === "light") {
    return appliedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function writeWorkspaceTheme(theme: WorkspaceTheme) {
  if (typeof window === "undefined") {
    return;
  }

  const jiraColorMode = document.documentElement.dataset.colorMode;
  document.documentElement.dataset.theme = jiraColorMode === "dark" || jiraColorMode === "light"
    ? jiraColorMode
    : theme;
  window.localStorage.removeItem(preferenceStorageKeys.theme);
}

export function syncWorkspaceThemeFromJira() {
  const previousTheme = document.documentElement.dataset.theme;
  const nextTheme = readWorkspaceTheme();
  document.documentElement.dataset.theme = nextTheme;
  window.localStorage.removeItem(preferenceStorageKeys.theme);

  if (previousTheme !== nextTheme) {
    emitWorkspacePreferenceUpdate({ theme: nextTheme });
  }

  return nextTheme;
}

export function readSidebarMode(): SidebarMode {
  if (typeof window === "undefined") {
    return "collapsed";
  }

  return window.localStorage.getItem(preferenceStorageKeys.sidebarCollapsed) === "false"
    ? "expanded"
    : "collapsed";
}

export function writeSidebarMode(sidebarMode: SidebarMode) {
  document.documentElement.dataset.sidebar = sidebarMode;
  window.localStorage.setItem(preferenceStorageKeys.sidebarCollapsed, String(sidebarMode === "collapsed"));
}

export function emitWorkspacePreferenceUpdate(detail: WorkspacePreferenceUpdate) {
  window.dispatchEvent(new CustomEvent(PREFERENCES_UPDATED_EVENT, { detail }));
}
