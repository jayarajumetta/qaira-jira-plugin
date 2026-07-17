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

export const NOTIFICATION_EVENT_PREFERENCES: Array<keyof NotificationPreferences> = [
  "executionFailures",
  "executionCompletions",
  "runAssignments",
  "issueReports",
  "aiDesign",
  "aiAutomation",
  "importExport",
  "requirementChanges",
  "testCaseChanges",
  "integrationChanges",
  "userRoleChanges",
  "projectMembership",
  "scheduledRuns"
];

// Notifications are generated from successful backend events. No demo records are mixed into the production feed.
export const NOTIFICATION_FEED: NotificationCenterItem[] = [];

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
