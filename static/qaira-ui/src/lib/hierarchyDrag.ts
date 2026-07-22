export const HIERARCHY_DRAG_MIME = "application/x-qaira-hierarchy+json";
export const HIERARCHY_MOVE_BATCH_SIZE = 100;

export type HierarchyDragKind = "requirement" | "test-case";

type HierarchyDragPayload = {
  kind: HierarchyDragKind;
  ids: string[];
  version: 1;
};

const uniqueIds = (ids: string[]) => [...new Set(ids.map(String).map((id) => id.trim()).filter(Boolean))];

export function resolveHierarchyDragIds(anchorId: string, selectedIds: string[]) {
  const normalizedAnchorId = String(anchorId || "").trim();
  const normalizedSelectedIds = uniqueIds(selectedIds);

  if (!normalizedAnchorId) {
    return [];
  }

  return normalizedSelectedIds.includes(normalizedAnchorId) ? normalizedSelectedIds : [normalizedAnchorId];
}

export function chunkHierarchyMoveIds(ids: string[], batchSize = HIERARCHY_MOVE_BATCH_SIZE) {
  const normalizedIds = uniqueIds(ids);
  const safeBatchSize = Math.max(1, Math.min(HIERARCHY_MOVE_BATCH_SIZE, Math.floor(batchSize) || HIERARCHY_MOVE_BATCH_SIZE));
  const batches: string[][] = [];

  for (let offset = 0; offset < normalizedIds.length; offset += safeBatchSize) {
    batches.push(normalizedIds.slice(offset, offset + safeBatchSize));
  }

  return batches;
}

export function writeHierarchyDragPayload(dataTransfer: DataTransfer, kind: HierarchyDragKind, ids: string[]) {
  const normalizedIds = uniqueIds(ids);
  const payload: HierarchyDragPayload = { kind, ids: normalizedIds, version: 1 };

  dataTransfer.effectAllowed = "move";
  try {
    dataTransfer.setData(HIERARCHY_DRAG_MIME, JSON.stringify(payload));
  } catch {
    // The in-memory selection remains a safe fallback in browsers that reject custom MIME types.
  }
  try {
    dataTransfer.setData("text/plain", normalizedIds.join("\n"));
  } catch {
    // A plain-text payload is helpful outside the app but not required for an in-app move.
  }
}

export function readHierarchyDragPayload(
  dataTransfer: DataTransfer,
  expectedKind: HierarchyDragKind,
  fallbackIds: string[] = []
) {
  const fallback = uniqueIds(fallbackIds);

  try {
    const serialized = dataTransfer.getData(HIERARCHY_DRAG_MIME);
    if (!serialized) {
      return fallback;
    }

    const payload = JSON.parse(serialized) as Partial<HierarchyDragPayload>;
    if (payload.version !== 1 || payload.kind !== expectedKind || !Array.isArray(payload.ids)) {
      return fallback;
    }

    return uniqueIds(payload.ids);
  } catch {
    return fallback;
  }
}
