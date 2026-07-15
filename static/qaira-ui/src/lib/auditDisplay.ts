import { resolveUserPrimaryLabel } from "./userDisplay";
import type { User } from "../types";

const auditDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function formatAuditTimestamp(value?: string | null, fallback = "Not recorded") {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : auditDateTimeFormatter.format(parsed);
}

export function resolveAuditUserLabel(userId: string | null | undefined, userById: Record<string, User>, fallback = "System") {
  if (!userId) {
    return fallback;
  }

  const user = userById[userId];
  return user ? resolveUserPrimaryLabel(user) : userId;
}
