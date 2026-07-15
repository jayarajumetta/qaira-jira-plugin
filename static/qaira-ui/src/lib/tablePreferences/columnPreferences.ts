import { api } from "../api";

export type ColumnPreferenceColumn = {
  canToggle?: boolean;
  defaultVisible?: boolean;
  key: string;
  label?: string;
  maxWidth?: number;
  minWidth?: number;
  preferenceLabel?: string;
};

export type StoredColumnPreference = {
  columnWidths?: Record<string, number>;
  density?: "comfortable" | "compact";
  orderedColumnKeys?: string[];
  visibleColumnKeys?: string[];
};

export type NormalizedColumnPreference = {
  columnWidths: Record<string, number>;
  density: "comfortable" | "compact";
  orderedColumnKeys: string[];
  visibleColumnKeys: string[];
};

export const DEFAULT_COLUMN_WIDTH = 160;
export const DEFAULT_MIN_COLUMN_WIDTH = 72;
export const DEFAULT_MAX_COLUMN_WIDTH = 640;

let workspacePreferenceCache: Record<string, unknown> | null = null;
let workspacePreferenceRequest: Promise<Record<string, unknown>> | null = null;

export const clampColumnWidth = <Column extends ColumnPreferenceColumn>(column: Column, width: number) => {
  const minWidth = column.minWidth || DEFAULT_MIN_COLUMN_WIDTH;
  const maxWidth = column.maxWidth || DEFAULT_MAX_COLUMN_WIDTH;
  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)));
};

export const readStoredColumnPreference = (storageKey: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as StoredColumnPreference : null;
  } catch {
    return null;
  }
};

export const writeStoredColumnPreference = (storageKey: string, value: NormalizedColumnPreference) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
};

export const loadWorkspacePreferenceCache = async () => {
  if (workspacePreferenceCache) {
    return workspacePreferenceCache;
  }

  if (!workspacePreferenceRequest) {
    workspacePreferenceRequest = api.settings
      .getWorkspacePreferences()
      .then((response) => {
        workspacePreferenceCache = response.preferences || {};
        return workspacePreferenceCache;
      })
      .catch(() => {
        workspacePreferenceCache = {};
        return workspacePreferenceCache;
      })
      .finally(() => {
        workspacePreferenceRequest = null;
      });
  }

  return workspacePreferenceRequest;
};

export const saveWorkspacePreference = async (storageKey: string, value: NormalizedColumnPreference) => {
  const nextCache = {
    ...(workspacePreferenceCache || {}),
    [storageKey]: value
  };

  workspacePreferenceCache = nextCache;
  await api.settings.updateWorkspacePreferences({
    preferences: {
      [storageKey]: value
    }
  });
};

const getDefaultVisibleColumnKeys = <Column extends ColumnPreferenceColumn>(columns: Column[]) =>
  columns.filter((column) => column.canToggle !== false && column.defaultVisible !== false).map((column) => column.key);

const getDefaultOrderedColumnKeys = <Column extends ColumnPreferenceColumn>(columns: Column[]) =>
  columns.map((column) => column.key);

export const isSelectionColumnKey = (key: string) => key === "select" || key === "selection" || key.startsWith("select-");

export const getColumnPreferenceLabel = <Column extends ColumnPreferenceColumn>(column: Column) =>
  column.preferenceLabel || column.label || column.key;

export const normalizeColumnPreference = <Column extends ColumnPreferenceColumn>(
  columns: Column[],
  input?: StoredColumnPreference | null
): NormalizedColumnPreference => {
  const allColumnKeys = getDefaultOrderedColumnKeys(columns);
  const configurableColumnKeySet = new Set(columns.filter((column) => column.canToggle !== false).map((column) => column.key));
  const defaultVisibleColumnKeys = getDefaultVisibleColumnKeys(columns);
  const candidateVisibleKeys = Array.isArray(input?.visibleColumnKeys)
    ? input.visibleColumnKeys.filter((key): key is string => typeof key === "string" && configurableColumnKeySet.has(key))
    : defaultVisibleColumnKeys;
  const orderedKeysSource = Array.isArray(input?.orderedColumnKeys)
    ? input.orderedColumnKeys.filter((key): key is string => typeof key === "string")
    : allColumnKeys;
  const pinnedSelectionKeys = allColumnKeys.filter(isSelectionColumnKey);
  const nonSelectionColumnKeys = allColumnKeys.filter((key) => !isSelectionColumnKey(key));
  const orderedNonSelectionKeys = orderedKeysSource.filter((key) => nonSelectionColumnKeys.includes(key));
  const orderedColumnKeys = [
    ...pinnedSelectionKeys,
    ...new Set([...orderedNonSelectionKeys, ...nonSelectionColumnKeys])
  ];
  const columnWidths = Object.entries(input?.columnWidths || {}).reduce<Record<string, number>>((accumulator, [key, width]) => {
    const column = columns.find((candidate) => candidate.key === key);
    if (column && typeof width === "number" && Number.isFinite(width)) {
      accumulator[key] = clampColumnWidth(column, width);
    }
    return accumulator;
  }, {});

  return {
    visibleColumnKeys: configurableColumnKeySet.size
      ? (candidateVisibleKeys.length ? [...new Set(candidateVisibleKeys)] : [defaultVisibleColumnKeys[0] || Array.from(configurableColumnKeySet)[0]])
      : [],
    orderedColumnKeys,
    columnWidths,
    density: input?.density === "compact" ? "compact" : "comfortable"
  };
};

export const moveColumnKey = (keys: string[], draggedKey: string, targetKey: string) => {
  if (draggedKey === targetKey) {
    return keys;
  }

  const nextKeys = keys.filter((key) => key !== draggedKey);
  const targetIndex = nextKeys.indexOf(targetKey);

  if (targetIndex === -1) {
    nextKeys.push(draggedKey);
    return nextKeys;
  }

  nextKeys.splice(targetIndex, 0, draggedKey);
  return nextKeys;
};
