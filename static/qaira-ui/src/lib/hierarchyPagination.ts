/**
 * Hierarchy children use summary projections, so a single page of up to 50
 * records is a practical "load it all" experience without approaching Jira's
 * 100-record request ceiling. Larger containers deliberately step down to 25
 * records per request to keep Forge execution time and response memory stable.
 */
export const HIERARCHY_COMPLETE_LOAD_LIMIT = 50;
export const HIERARCHY_LARGE_PAGE_SIZE = 25;

export function getHierarchyPageSize(reportedTotal: number | null | undefined, pageIndex: number) {
  if (pageIndex > 0) return HIERARCHY_LARGE_PAGE_SIZE;

  const normalizedTotal = Number(reportedTotal);
  if (Number.isFinite(normalizedTotal) && normalizedTotal > 0) {
    return normalizedTotal <= HIERARCHY_COMPLETE_LOAD_LIMIT
      ? normalizedTotal
      : HIERARCHY_LARGE_PAGE_SIZE;
  }

  // Jira-native sprint counts can be unknown until their first child query.
  // One bounded 50-record summary request avoids a needless continuation for
  // ordinary sprints while still returning a verified cursor for large ones.
  return HIERARCHY_COMPLETE_LOAD_LIMIT;
}

export function getUnassignedPageSize(hasCursor: boolean) {
  return hasCursor ? HIERARCHY_LARGE_PAGE_SIZE : HIERARCHY_COMPLETE_LOAD_LIMIT;
}
