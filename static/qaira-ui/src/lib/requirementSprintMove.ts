import type { Requirement, RequirementIteration } from "../types";

// Jira Software accepts at most 50 issues in a single Sprint move. Keeping the
// UI batch aligned with that boundary also makes partial failures observable:
// every fulfilled Qaira request represents one completed Jira mutation.
export const JIRA_SPRINT_MOVE_BATCH_SIZE = 50;
export const REQUIREMENT_SPRINT_MOVE_PERSISTENCE_TTL_MS = 30 * 60_000;
export const REQUIREMENT_SPRINT_MOVE_PERSISTENCE_LIMIT = 100;

const REQUIREMENT_SPRINT_MOVE_STORAGE_PREFIX = "qaira.requirements.confirmed-sprint-moves.v1";

type RequirementSprintMoveStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ConfirmedRequirementSprintMove = {
  requirement: Requirement;
  targetIterationId: string;
  targetSprintId: string | null;
  targetSprintName: string;
  targetSprintState: string | null;
  confirmedAt: number;
};

const normalizedValue = (value?: string | null) => String(value || "").trim().toLowerCase();

export function requirementMatchesSprint(
  requirement: Requirement,
  move: ConfirmedRequirementSprintMove
) {
  // A Jira Sprint id is authoritative. Do not accept a cached Sprint name or
  // legacy Qaira iteration property as confirmation of a native Jira move.
  if (move.targetSprintId) {
    return String(requirement.sprint_id || "") === move.targetSprintId;
  }

  return requirement.iteration_id === move.targetIterationId
    || normalizedValue(requirement.sprint) === normalizedValue(move.targetSprintName);
}

export function requirementSprintMoveIsSettled(
  requirements: Requirement[],
  move: ConfirmedRequirementSprintMove
) {
  const evidence = requirements.filter((requirement) => requirement.id === move.requirement.id);
  if (!evidence.some((requirement) => requirementMatchesSprint(requirement, move))) return false;

  if (move.targetSprintId) {
    // A stale source-Sprint page can briefly coexist with the confirmed target
    // page while Jira refreshes its search index. Keep projecting the move
    // until no loaded Jira response contradicts the target Sprint id.
    return evidence.every((requirement) => {
      const sprintId = String(requirement.sprint_id || "");
      return !sprintId || sprintId === move.targetSprintId;
    });
  }

  return evidence.every((requirement) => {
    if (requirement.iteration_id && requirement.iteration_id !== move.targetIterationId) return false;
    const sprintName = normalizedValue(requirement.sprint);
    return !sprintName || sprintName === normalizedValue(move.targetSprintName);
  });
}

export function projectConfirmedRequirementSprintMove(
  move: ConfirmedRequirementSprintMove,
  current?: Requirement | null
): Requirement {
  return {
    ...move.requirement,
    ...(current || {}),
    iteration_id: move.targetIterationId,
    sprint: move.targetSprintName,
    sprint_id: move.targetSprintId,
    sprint_state: move.targetSprintState
  };
}

export function createConfirmedRequirementSprintMove(
  requirement: Requirement,
  iteration: RequirementIteration,
  confirmedAt = Date.now()
): ConfirmedRequirementSprintMove {
  return {
    requirement,
    targetIterationId: iteration.id,
    targetSprintId: iteration.jira_sprint_id ? String(iteration.jira_sprint_id) : null,
    targetSprintName: iteration.jira_sprint_name || iteration.name,
    targetSprintState: iteration.state || iteration.status || null,
    confirmedAt
  };
}

function requirementSprintMoveStorageKey(scope: string) {
  return `${REQUIREMENT_SPRINT_MOVE_STORAGE_PREFIX}:${encodeURIComponent(scope)}`;
}

function normalizedPersistedMove(
  requirementId: string,
  candidate: unknown,
  now: number
): ConfirmedRequirementSprintMove | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const value = candidate as Partial<ConfirmedRequirementSprintMove>;
  const requirement = value.requirement;
  const confirmedAt = Number(value.confirmedAt);
  if (!requirement || typeof requirement !== "object" || String(requirement.id || "") !== requirementId) return null;
  if (!String(value.targetIterationId || "") || !String(value.targetSprintName || "")) return null;
  if (!Number.isFinite(confirmedAt) || confirmedAt > now + 60_000 || now - confirmedAt > REQUIREMENT_SPRINT_MOVE_PERSISTENCE_TTL_MS) return null;

  return {
    requirement,
    targetIterationId: String(value.targetIterationId),
    targetSprintId: value.targetSprintId ? String(value.targetSprintId) : null,
    targetSprintName: String(value.targetSprintName),
    targetSprintState: value.targetSprintState ? String(value.targetSprintState) : null,
    confirmedAt
  };
}

export function prunePersistedRequirementSprintMoves(
  moves: Record<string, ConfirmedRequirementSprintMove>,
  now = Date.now()
) {
  return Object.fromEntries(
    Object.entries(moves)
      .map(([requirementId, move]) => [requirementId, normalizedPersistedMove(requirementId, move, now)] as const)
      .filter((entry): entry is readonly [string, ConfirmedRequirementSprintMove] => Boolean(entry[1]))
      .sort((left, right) => right[1].confirmedAt - left[1].confirmedAt)
      .slice(0, REQUIREMENT_SPRINT_MOVE_PERSISTENCE_LIMIT)
  );
}

export function readPersistedRequirementSprintMoves(
  storage: RequirementSprintMoveStorage | null,
  scope: string,
  now = Date.now()
) {
  if (!storage || !scope) return {};
  const key = requirementSprintMoveStorageKey(scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const moves = prunePersistedRequirementSprintMoves(
      parsed?.version === 1 && parsed?.moves && typeof parsed.moves === "object" ? parsed.moves : {},
      now
    );
    if (!Object.keys(moves).length) storage.removeItem(key);
    return moves;
  } catch {
    try { storage.removeItem(key); } catch { /* Storage can be unavailable in a restricted iframe. */ }
    return {};
  }
}

export function writePersistedRequirementSprintMoves(
  storage: RequirementSprintMoveStorage | null,
  scope: string,
  moves: Record<string, ConfirmedRequirementSprintMove>,
  now = Date.now()
) {
  if (!storage || !scope) return;
  const key = requirementSprintMoveStorageKey(scope);
  try {
    const persisted = prunePersistedRequirementSprintMoves(moves, now);
    if (!Object.keys(persisted).length) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify({ version: 1, moves: persisted }));
  } catch {
    // Jira remains authoritative when browser storage is unavailable. The
    // in-memory projection still covers the current page lifecycle.
  }
}

export function resolveRequirementSprintIteration(
  requirement: Requirement,
  iterations: RequirementIteration[]
) {
  const sprintId = String(requirement.sprint_id || "");
  if (sprintId) {
    return iterations.find((iteration) => String(iteration.jira_sprint_id || "") === sprintId);
  }

  const sprintName = normalizedValue(requirement.sprint);
  if (sprintName) {
    return iterations.find((iteration) =>
      [iteration.jira_sprint_name, iteration.name]
        .some((candidate) => normalizedValue(candidate) === sprintName)
    );
  }

  // Local membership remains available only for a legacy Qaira-owned
  // iteration. Native Jira Sprints are derived from Jira's Sprint field/JQL;
  // stale project-property ids must never make an unassigned Story immovable.
  const explicitIteration = iterations.find((iteration) =>
    iteration.id === requirement.iteration_id
    && iteration.source !== "jira"
    && !iteration.jira_sprint_id
  );
  if (explicitIteration) return explicitIteration;

  return iterations.find((iteration) =>
    iteration.source !== "jira"
    && !iteration.jira_sprint_id
    && (iteration.requirement_ids || []).map(String).includes(requirement.id)
  );
}
