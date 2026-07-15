import { readNotificationPreferences, type NotificationPreferences } from "./notificationPreferences";

export const NOTIFICATIONS_UPDATED_EVENT = "qaira:notifications-updated";
const NOTIFICATION_READ_IDS_KEY = "qaira.notification_read_ids";
const NOTIFICATION_CLEARED_IDS_KEY = "qaira.notification_cleared_ids";

export type NotificationCenterItem = {
  id: string;
  title: string;
  detail: string;
  tone: "error" | "success" | "info" | "neutral";
  preference: keyof NotificationPreferences;
};

export const NOTIFICATION_FEED: NotificationCenterItem[] = [
  { id: "execution-failed-checkout-regression", title: "Run failed in Checkout Regression", detail: "2 minutes ago · Web Portal · Assigned to release team", tone: "error", preference: "executionFailures" },
  { id: "nightly-regression-completed", title: "Nightly regression completed", detail: "7 minutes ago · 214 cases passed · 6 failures need review", tone: "success", preference: "executionCompletions" },
  { id: "manual-run-assigned", title: "Manual run assigned", detail: "12 minutes ago · Billing smoke run assigned to QA owner", tone: "info", preference: "runAssignments" },
  { id: "issue-reported-execution-console", title: "Bug reported from execution console", detail: "16 minutes ago · Failed payment validation step captured with evidence", tone: "error", preference: "issueReports" },
  { id: "ai-design-preview-completed", title: "AI design preview completed", detail: "18 minutes ago · Requirement coverage suggestions are ready", tone: "success", preference: "aiDesign" },
  { id: "automation-draft-generated", title: "Automation draft generated", detail: "27 minutes ago · 8 coded steps created for login recovery", tone: "success", preference: "aiAutomation" },
  { id: "test-data-import-completed", title: "Test data import completed", detail: "41 minutes ago · 320 rows validated with 4 warnings", tone: "info", preference: "importExport" },
  { id: "requirement-changed-checkout-copy", title: "Requirement changed", detail: "52 minutes ago · Checkout copy requirement moved to review", tone: "neutral", preference: "requirementChanges" },
  { id: "test-case-updated-refund-path", title: "Test case updated", detail: "Today · Refund happy path priority changed to high", tone: "neutral", preference: "testCaseChanges" },
  { id: "integration-activated-browserstack", title: "New integration was activated", detail: "Today · BrowserStack cloud run connection enabled", tone: "info", preference: "integrationChanges" },
  { id: "role-permissions-changed-release-manager", title: "Role permissions changed", detail: "Today · Release manager can approve manual runs", tone: "neutral", preference: "userRoleChanges" },
  { id: "project-membership-mobile-qa", title: "Project membership changed", detail: "Today · Two new members added to Mobile QA", tone: "neutral", preference: "projectMembership" },
  { id: "scheduled-run-queued-daily-smoke", title: "Scheduled run queued", detail: "Tomorrow · Daily smoke suite will start at 09:00", tone: "info", preference: "scheduledRuns" }
];

function readIdList(key: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    window.localStorage.removeItem(key);
    return [];
  }
}

function writeIdList(key: string, ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(Array.from(new Set(ids))));
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
}

export function readNotificationCenterState() {
  return {
    clearedIds: readIdList(NOTIFICATION_CLEARED_IDS_KEY),
    readIds: readIdList(NOTIFICATION_READ_IDS_KEY)
  };
}

export function getVisibleNotifications() {
  const preferences = readNotificationPreferences();

  if (!preferences.inApp) {
    return [];
  }

  const { clearedIds } = readNotificationCenterState();
  return NOTIFICATION_FEED.filter((item) => preferences[item.preference] && !clearedIds.includes(item.id));
}

export function getUnreadNotificationCount() {
  const { readIds } = readNotificationCenterState();
  return getVisibleNotifications().filter((item) => !readIds.includes(item.id)).length;
}

export function markNotificationRead(id: string) {
  writeIdList(NOTIFICATION_READ_IDS_KEY, [...readIdList(NOTIFICATION_READ_IDS_KEY), id]);
}

export function clearAllNotifications(ids = NOTIFICATION_FEED.map((item) => item.id)) {
  writeIdList(NOTIFICATION_CLEARED_IDS_KEY, [...readIdList(NOTIFICATION_CLEARED_IDS_KEY), ...ids]);
}
