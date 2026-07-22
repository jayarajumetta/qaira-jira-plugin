export type SafePagedResult<T> = {
  items: T[];
  total: number;
  next_cursor: string | null;
  is_last: boolean;
};

/**
 * Treat remote collections as untrusted input. Forge deployments can briefly
 * serve mixed frontend/backend versions, and older stored payloads may omit
 * collection fields that are required by the current TypeScript contract.
 */
export function asArray<T>(value: T[] | null | undefined): T[];
export function asArray<T>(value: unknown): T[];
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function normalizePagedResult<T>(value: unknown): SafePagedResult<T> {
  if (Array.isArray(value)) {
    return {
      items: value as T[],
      total: value.length,
      next_cursor: null,
      is_last: true
    };
  }

  const candidate = value && typeof value === "object"
    ? value as Partial<SafePagedResult<T>>
    : {};
  const items = asArray<T>(candidate.items);
  const total = Number(candidate.total);
  const nextCursor = typeof candidate.next_cursor === "string" && candidate.next_cursor.trim()
    ? candidate.next_cursor
    : null;

  return {
    items,
    total: Number.isFinite(total) && total >= 0 ? total : items.length,
    next_cursor: nextCursor,
    is_last: typeof candidate.is_last === "boolean" ? candidate.is_last : !nextCursor
  };
}

/**
 * A continuation is usable only when the backend supplies both halves of the
 * pagination contract: a non-empty cursor and an explicit non-final page.
 * This keeps stale or contradictory envelopes from surfacing a dead
 * "Load more" action.
 */
export function getVerifiedNextPageCursor(
  page: Pick<SafePagedResult<unknown>, "is_last" | "next_cursor"> | null | undefined
): string | undefined {
  if (!page || page.is_last !== false) return undefined;
  const cursor = typeof page.next_cursor === "string" ? page.next_cursor.trim() : "";
  return cursor || undefined;
}
