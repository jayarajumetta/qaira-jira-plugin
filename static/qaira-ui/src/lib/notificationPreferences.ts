export const NOTIFICATION_PREFERENCES_KEY = "qaira.notification_preferences";

export type NotificationPreferences = {
  executionFailures: boolean;
  executionCompletions: boolean;
  runAssignments: boolean;
  issueReports: boolean;
  aiDesign: boolean;
  aiAutomation: boolean;
  importExport: boolean;
  requirementChanges: boolean;
  testCaseChanges: boolean;
  integrationChanges: boolean;
  userRoleChanges: boolean;
  projectMembership: boolean;
  scheduledRuns: boolean;
  inApp: boolean;
  digest: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  executionFailures: true,
  executionCompletions: true,
  runAssignments: true,
  issueReports: true,
  aiDesign: true,
  aiAutomation: true,
  importExport: true,
  requirementChanges: true,
  testCaseChanges: true,
  integrationChanges: true,
  userRoleChanges: true,
  projectMembership: true,
  scheduledRuns: true,
  inApp: true,
  digest: true
};

export function readNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  const stored = window.localStorage.getItem(NOTIFICATION_PREFERENCES_KEY);

  if (!stored) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<NotificationPreferences>;
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => typeof value === "boolean")
      )
    };
  } catch {
    window.localStorage.removeItem(NOTIFICATION_PREFERENCES_KEY);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function writeNotificationPreferences(value: NotificationPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(value));
}
