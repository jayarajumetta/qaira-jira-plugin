import { api } from "../api";
import {
  clampColumnWidth,
  type ColumnDensity
} from "./columnSizing";

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
  density?: ColumnDensity;
  orderedColumnKeys?: string[];
  visibleColumnKeys?: string[];
};

export type NormalizedColumnPreference = {
  columnWidths: Record<string, number>;
  density: ColumnDensity;
  orderedColumnKeys: string[];
  visibleColumnKeys: string[];
};

let workspacePreferenceCache: Record<string, unknown> | null = null;
let workspacePreferenceRequest: Promise<Record<string, unknown>> | null = null;

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

// Default restores each column definition. "Show all" is a separate explicit
// action, while a persisted list remains authoritative for user-hidden columns.
export const getDefaultVisibleColumnKeys = <Column extends ColumnPreferenceColumn>(columns: Column[]) =>
  columns
    .filter((column) => column.canToggle !== false && column.defaultVisible !== false)
    .map((column) => column.key);

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
  if (draggedKey === targetKey || isSelectionColumnKey(draggedKey) || isSelectionColumnKey(targetKey)) {
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
