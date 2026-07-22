export type LocalizationStrings = Record<string, string>;

export const DEFAULT_LOCALIZATION_STRINGS: LocalizationStrings = {
  "nav.section.main": "Main",
  "nav.section.testManagement": "Test Management",
  "nav.section.administration": "Administration",
  "nav.section.settings": "Settings",
  "nav.dashboard": "Dashboard",
  "nav.projects": "Projects",
  "nav.adminSpace": "Admin Space",
  "nav.testAuthoring": "Test Authoring",
  "nav.testRuns": "Test Runs",
  "nav.agenticWorkflows": "Agentic Workflows",
  "nav.testEnvironment": "Test Environment",
  "nav.knowledge": "Knowledge Repo",
  "nav.users": "Users",
  "nav.integrations": "Integrations",
  "nav.support": "Support",
  "nav.notifications": "Notifications",
  "nav.settings": "Settings",
  "nav.reportIssue": "Bugs",
  "nav.feedback": "Bugs",
  "workspace.requirements": "Stories",
  "workspace.testCases": "Test Cases",
  "workspace.sharedSteps": "Shared Steps",
  "workspace.testSuites": "Test Suites",
  "workspace.executions": "Test Runs",
  "workspace.automationCases": "Automation Cases",
  "workspace.objectRepository": "Object Repository",
  "workspace.batchProcess": "Batch Process",
  "workspace.opsTelemetry": "OPS Telemetry",
  "workspace.traces": "Distributed Traces",
  "workspace.environments": "Environments",
  "workspace.testData": "Test Data",
  "workspace.configurations": "Configurations",
  "page.overview": "Overview",
  "page.projects": "Projects",
  "page.adminSpace": "Admin Space",
  "page.requirements": "Stories",
  "page.testCases": "Test Cases",
  "page.sharedSteps": "Shared Step Groups",
  "page.design": "Test Suites",
  "page.executions": "Test Runs",
  "page.agenticWorkflows": "Agentic Workflows",
  "page.testEnvironments": "Test Environments",
  "page.testData": "Test Data",
  "page.testConfigurations": "Test Configurations",
  "page.people": "Users",
  "page.integrations": "Integrations",
  "page.knowledgeRepo": "Knowledge Repo",
  "page.support": "Support",
  "page.notifications": "Notifications",
  "page.settings": "Settings",
  "page.issues": "Bugs",
  "page.feedback": "Bugs",
  "settings.localization.title": "Localization",
  "settings.localization.subtitle": "Download the current runtime strings, edit the JSON, then upload it to relabel menus and supported interface text.",
  "settings.localization.download": "Download current strings",
  "settings.localization.upload": "Upload JSON",
  "settings.localization.reset": "Reset uploaded strings",
  "settings.localization.helper": "Only admins can publish updated localization strings for the workspace.",
  "settings.general.themeLight": "Light theme",
  "settings.general.themeDark": "Dark theme",
  "settings.general.sidebarExpanded": "Expanded sidebar by default",
  "settings.general.sidebarCollapsed": "Collapsed sidebar by default",
  "settings.general.catalogGrid": "Open catalogs in grid view by default",
  "settings.general.catalogList": "Open catalogs in list view by default",
  "settings.export.autoPrompt": "Offer execution export prompts after completed runs",
  "settings.export.historyTitle": "Historical evidence is preserved",
  "settings.export.historyCopy": "Deleting live suites or test cases does not remove execution snapshots already captured.",
  "common.savePreferences": "Save preferences",
  "common.download": "Download",
  "common.upload": "Upload",
  "common.import": "Import",
  "common.export": "Export",
  "common.save": "Save",
  "common.reset": "Reset",
  "catalog.view.tile": "Tile view",
  "catalog.view.list": "List view",
  "catalog.copyId": "Copy ID"
};

export const LOCALIZATION_STORAGE_KEY = "qaira.localization";

const migrateLegacyStoryLabels = (overrides?: LocalizationStrings | null): LocalizationStrings => {
  const migrated = { ...(overrides || {}) };

  (["workspace.requirements", "page.requirements"] as const).forEach((key) => {
    if (migrated[key] === "Requirement") migrated[key] = "Story";
    if (migrated[key] === "Requirements") migrated[key] = "Stories";
  });

  return migrated;
};

export const mergeLocalizationStrings = (overrides?: LocalizationStrings | null): LocalizationStrings => ({
  ...DEFAULT_LOCALIZATION_STRINGS,
  ...migrateLegacyStoryLabels(overrides)
});
