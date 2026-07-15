import type { ProjectMember, User } from "../types";

export type AssigneeOption = {
  id: string;
  name: string | null;
  email: string;
  label: string;
  caption: string | null;
};

type DisplayUser = {
  name?: string | null;
  email?: string | null;
} | null | undefined;

export function resolveUserPrimaryLabel(user?: DisplayUser) {
  const trimmedName = user?.name?.trim();
  return trimmedName || user?.email || "Unassigned";
}

export function resolveUserSecondaryLabel(user?: DisplayUser) {
  const trimmedName = user?.name?.trim();
  if (trimmedName && user?.email) {
    return user.email;
  }

  return null;
}

export function maskEmailAddress(email?: string | null) {
  return email ? "Email hidden" : "";
}

export function resolveVisibleEmail(email: string | null | undefined, canViewEmail: boolean) {
  return canViewEmail ? email || "" : maskEmailAddress(email);
}

export function resolveUserInitials(user?: DisplayUser) {
  const source = user?.name?.trim() || user?.email || "U";

  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

export function buildAssigneeOptions(projectMembers: ProjectMember[], users: User[]): AssigneeOption[] {
  const userById = users.reduce<Record<string, User>>((accumulator, user) => {
    accumulator[user.id] = user;
    return accumulator;
  }, {});

  return projectMembers
    .map((member) => userById[member.user_id])
    .filter((user): user is User => Boolean(user))
    .map((user) => ({
      id: user.id,
      name: user.name || null,
      email: user.email,
      label: resolveUserPrimaryLabel(user),
      caption: resolveUserSecondaryLabel(user)
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
