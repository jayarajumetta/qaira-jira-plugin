import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ColumnsIcon, DragHandleIcon, PinIcon, SearchIcon } from "./AppIcons";
import { InfoTooltip } from "./InfoTooltip";
import { discoverRowColumns, formatDiscoveredValue } from "../lib/tablePreferences/columnDiscovery";
import {
  getColumnPreferenceLabel,
  isSelectionColumnKey,
  loadWorkspacePreferenceCache,
  moveColumnKey,
  normalizeColumnPreference,
  readStoredColumnPreference,
  saveWorkspacePreference,
  writeStoredColumnPreference,
  type NormalizedColumnPreference,
  type StoredColumnPreference
} from "../lib/tablePreferences/columnPreferences";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_MAX_COLUMN_WIDTH,
  buildColumnPresetWidths,
  clampColumnWidth,
  estimateColumnContentWidth,
  getColumnMinimumWidth,
  getColumnPresetWidth,
  type ColumnDensity
} from "../lib/tablePreferences/columnSizing";

const SELECTION_COLUMN_WIDTH = 36;
const COLUMN_CONFIG_WIDTH = 28;

export type DataTableColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  headerRender?: () => ReactNode;
  canToggle?: boolean;
  defaultVisible?: boolean;
  canReorder?: boolean;
  canResize?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  preferenceLabel?: string;
  description?: string;
  group?: string;
  dataType?: "boolean" | "date" | "list" | "number" | "text";
};

export function DataTable<T>({
  columns,
  rows,
  emptyMessage,
  storageKey,
  getRowKey,
  onRowClick,
  getRowClassName,
  getRowDraggable,
  onRowDragStart,
  onRowDragEnd,
  enableHeaderColumnReorder = false,
  enableColumnResize = true,
  enableRowSelection = true,
  includeDiscoveredColumns = true
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  emptyMessage: string;
  storageKey?: string;
  getRowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T) => string;
  getRowDraggable?: (row: T) => boolean;
  onRowDragStart?: (row: T, event: ReactDragEvent<HTMLTableRowElement>) => void;
  onRowDragEnd?: (row: T) => void;
  hideToolbarCopy?: boolean;
  hideVisibleColumnPreview?: boolean;
  enableHeaderColumnReorder?: boolean;
  enableColumnResize?: boolean;
  enableRowSelection?: boolean;
  includeDiscoveredColumns?: boolean;
}) {
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [draggedColumnKey, setDraggedColumnKey] = useState("");
  const [sortState, setSortState] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const discoveredColumns = useMemo<Array<DataTableColumn<T>>>(() => {
    if (!includeDiscoveredColumns) return [];
    return discoverRowColumns(rows, columns.map((column) => column.key)).map((column) => ({
      ...column,
      defaultVisible: false,
      render: (row: T) => (
        <span className="data-table-discovered-value" title={formatDiscoveredValue((row as Record<string, unknown>)[column.key], column.dataType)}>
          {formatDiscoveredValue((row as Record<string, unknown>)[column.key], column.dataType)}
        </span>
      ),
      sortValue: (row: T) => {
        const value = (row as Record<string, unknown>)[column.key];
        return typeof value === "number" ? value : Array.isArray(value) ? value.join(", ") : String(value ?? "");
      }
    }));
  }, [columns, includeDiscoveredColumns, rows]);
  const resolvedColumns = useMemo(() => [...columns, ...discoveredColumns], [columns, discoveredColumns]);
  const [columnPreference, setColumnPreference] = useState<NormalizedColumnPreference>(() =>
    normalizeColumnPreference(resolvedColumns, storageKey ? readStoredColumnPreference(storageKey) : null)
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => columnPreference.columnWidths);
  const [isPreferenceHydrated, setIsPreferenceHydrated] = useState(!storageKey);
  const columnConfigRef = useRef<HTMLDivElement | null>(null);
  const columnConfigTriggerRef = useRef<HTMLButtonElement | null>(null);
  const columnConfigPanelRef = useRef<HTMLDivElement | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const lastSavedPreferenceFingerprintRef = useRef<string>("");
  const hydrationStorageKeyRef = useRef(storageKey || "");
  const hasLocalPreferenceChangeRef = useRef(false);
  const [columnConfigPanelPosition, setColumnConfigPanelPosition] = useState<{ top: number; right: number; maxHeight: number } | null>(null);

  useEffect(() => {
    setColumnPreference((current) => normalizeColumnPreference(resolvedColumns, current));
  }, [resolvedColumns]);

  useEffect(() => {
    setColumnWidths(columnPreference.columnWidths);
  }, [columnPreference.columnWidths]);

  const columnSchemaSignature = useMemo(
    () => resolvedColumns.map((column) => [column.key, column.defaultVisible, column.canToggle, column.minWidth, column.maxWidth].join(":")).join("|"),
    [resolvedColumns]
  );

  useEffect(() => {
    if (!storageKey) {
      hydrationStorageKeyRef.current = "";
      setIsPreferenceHydrated(true);
      return;
    }

    let isActive = true;
    hydrationStorageKeyRef.current = storageKey;
    hasLocalPreferenceChangeRef.current = false;
    setIsPreferenceHydrated(false);
    const localPreference = readStoredColumnPreference(storageKey);

    if (localPreference) {
      setColumnPreference(normalizeColumnPreference(resolvedColumns, localPreference));
    }

    void loadWorkspacePreferenceCache().then((preferences) => {
      if (!isActive || hydrationStorageKeyRef.current !== storageKey) {
        return;
      }

      const remotePreference = preferences[storageKey];
      if (!hasLocalPreferenceChangeRef.current && remotePreference && typeof remotePreference === "object" && !Array.isArray(remotePreference)) {
        const normalizedRemotePreference = normalizeColumnPreference(resolvedColumns, remotePreference as StoredColumnPreference);
        setColumnPreference(normalizedRemotePreference);
        writeStoredColumnPreference(storageKey, normalizedRemotePreference);
      } else if (!hasLocalPreferenceChangeRef.current && localPreference) {
        const normalizedLocalPreference = normalizeColumnPreference(resolvedColumns, localPreference);
        void saveWorkspacePreference(storageKey, normalizedLocalPreference).catch(() => undefined);
      }

      setIsPreferenceHydrated(true);
    });

    return () => {
      isActive = false;
    };
  }, [columnSchemaSignature, storageKey]);

  useEffect(() => {
    if (!storageKey || !isPreferenceHydrated || hydrationStorageKeyRef.current !== storageKey) {
      return;
    }

    writeStoredColumnPreference(storageKey, columnPreference);

    const serializedPreference = JSON.stringify(columnPreference);
    const persistenceFingerprint = `${storageKey}:${serializedPreference}`;
    if (lastSavedPreferenceFingerprintRef.current === persistenceFingerprint) {
      return;
    }

    lastSavedPreferenceFingerprintRef.current = persistenceFingerprint;
    void saveWorkspacePreference(storageKey, columnPreference).catch(() => {
      if (lastSavedPreferenceFingerprintRef.current === persistenceFingerprint) {
        lastSavedPreferenceFingerprintRef.current = "";
      }
    });
  }, [columnPreference, isPreferenceHydrated, storageKey]);

  useEffect(() => {
    if (!isColumnConfigOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (columnConfigRef.current?.contains(target) || columnConfigPanelRef.current?.contains(target)) {
        return;
      }
      setIsColumnConfigOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsColumnConfigOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isColumnConfigOpen]);

  const updateColumnConfigPanelPosition = () => {
    const trigger = columnConfigTriggerRef.current;
    if (!trigger) {
      setColumnConfigPanelPosition(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const triggerGap = 8;
    const preferredMaxHeight = 544;
    const minimumUsefulHeight = 260;
    const availableBelow = window.innerHeight - rect.bottom - triggerGap - viewportPadding;
    const availableAbove = rect.top - triggerGap - viewportPadding;
    const shouldOpenAbove = availableBelow < minimumUsefulHeight && availableAbove > availableBelow;
    const maxHeight = Math.max(
      minimumUsefulHeight,
      Math.min(preferredMaxHeight, shouldOpenAbove ? availableAbove : availableBelow)
    );
    const top = shouldOpenAbove
      ? Math.max(viewportPadding, rect.top - triggerGap - maxHeight)
      : Math.min(rect.bottom + triggerGap, window.innerHeight - viewportPadding - maxHeight);

    setColumnConfigPanelPosition({
      top,
      right: Math.max(window.innerWidth - rect.right, viewportPadding),
      maxHeight
    });
  };

  useEffect(() => {
    if (!isColumnConfigOpen) {
      return;
    }

    updateColumnConfigPanelPosition();
    window.addEventListener("resize", updateColumnConfigPanelPosition);
    window.addEventListener("scroll", updateColumnConfigPanelPosition, true);

    return () => {
      window.removeEventListener("resize", updateColumnConfigPanelPosition);
      window.removeEventListener("scroll", updateColumnConfigPanelPosition, true);
    };
  }, [isColumnConfigOpen]);

  const columnByKey = useMemo(
    () =>
      resolvedColumns.reduce<Record<string, DataTableColumn<T>>>((accumulator, column) => {
        accumulator[column.key] = column;
        return accumulator;
      }, {}),
    [resolvedColumns]
  );
  const configurableColumns = useMemo(() => resolvedColumns.filter((column) => column.canToggle !== false), [resolvedColumns]);
  const hasCustomSelectionColumn = useMemo(
    () => resolvedColumns.some((column) => column.key === "select" || column.key === "selection" || column.key.startsWith("select-")),
    [resolvedColumns]
  );
  const isSelectionColumn = (column: DataTableColumn<T>) => isSelectionColumnKey(column.key);
  const canReorderColumn = (column: DataTableColumn<T> | undefined) =>
    Boolean(column && column.canReorder !== false && !isSelectionColumn(column));
  const canResizeColumn = (column: DataTableColumn<T>) => column.canResize !== false && !isSelectionColumn(column);
  const getHeaderControlWidth = (column: DataTableColumn<T>) =>
    (column.sortValue ? 20 : 0) + (enableHeaderColumnReorder && canReorderColumn(column) ? 24 : 0);
  const getDataTableColumnMinimumWidth = (column: DataTableColumn<T>) =>
    getColumnMinimumWidth(column, getHeaderControlWidth(column));
  const clampDataTableColumnWidth = (column: DataTableColumn<T>, width: number) =>
    clampColumnWidth(column, width, getHeaderControlWidth(column));
  const shouldRenderSelectionColumn = enableRowSelection && !hasCustomSelectionColumn;
  const visibleColumnKeySet = useMemo(() => new Set(columnPreference.visibleColumnKeys), [columnPreference.visibleColumnKeys]);
  const orderedColumns = useMemo(
    () => columnPreference.orderedColumnKeys.map((key) => columnByKey[key]).filter(Boolean),
    [columnByKey, columnPreference.orderedColumnKeys]
  );
  const activeColumns = useMemo(
    () => orderedColumns.filter((column) => column.canToggle === false || visibleColumnKeySet.has(column.key)),
    [orderedColumns, visibleColumnKeySet]
  );
  const estimatedColumnContentWidths = useMemo(() => {
    const sampleRows = rows.slice(0, 80);

    return resolvedColumns.reduce<Record<string, number>>((widths, column) => {
      const sampleValues = [
        column.preferenceLabel || column.label,
        ...sampleRows.map((row) => {
          const sortedValue = column.sortValue?.(row);
          return sortedValue ?? (row as Record<string, unknown>)[column.key];
        })
      ];
      widths[column.key] = estimateColumnContentWidth(sampleValues);
      return widths;
    }, {});
  }, [resolvedColumns, rows]);

  const getPresetColumnWidths = (density: ColumnDensity) => buildColumnPresetWidths(
    resolvedColumns.filter((column) => !isSelectionColumn(column)),
    density,
    estimatedColumnContentWidths,
    getHeaderControlWidth
  );

  const updateColumnPreference = (updater: (current: NormalizedColumnPreference) => NormalizedColumnPreference) => {
    hasLocalPreferenceChangeRef.current = true;
    setIsPreferenceHydrated(true);
    setColumnPreference((current) => normalizeColumnPreference(resolvedColumns, updater(current)));
  };

  const moveColumn = (draggedKey: string, targetKey: string) => {
    if (!canReorderColumn(columnByKey[draggedKey]) || !canReorderColumn(columnByKey[targetKey])) {
      return;
    }

    updateColumnPreference((current) => ({
      ...current,
      orderedColumnKeys: moveColumnKey(current.orderedColumnKeys, draggedKey, targetKey)
    }));
  };

  const moveColumnByOffset = (columnKey: string, offset: -1 | 1) => {
    if (!canReorderColumn(columnByKey[columnKey])) {
      return;
    }

    updateColumnPreference((current) => {
      const orderedColumnKeys = [...current.orderedColumnKeys];
      const currentIndex = orderedColumnKeys.indexOf(columnKey);
      let targetIndex = currentIndex + offset;

      while (targetIndex >= 0 && targetIndex < orderedColumnKeys.length) {
        const targetColumn = columnByKey[orderedColumnKeys[targetIndex]];
        if (canReorderColumn(targetColumn)) break;
        targetIndex += offset;
      }

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedColumnKeys.length) return current;
      [orderedColumnKeys[currentIndex], orderedColumnKeys[targetIndex]] = [orderedColumnKeys[targetIndex], orderedColumnKeys[currentIndex]];
      return { ...current, orderedColumnKeys };
    });
  };

  const canMoveColumnByOffset = (columnKey: string, offset: -1 | 1) => {
    if (!canReorderColumn(columnByKey[columnKey])) {
      return false;
    }

    const currentIndex = columnPreference.orderedColumnKeys.indexOf(columnKey);
    for (let index = currentIndex + offset; index >= 0 && index < columnPreference.orderedColumnKeys.length; index += offset) {
      const candidate = columnByKey[columnPreference.orderedColumnKeys[index]];
      if (canReorderColumn(candidate)) return true;
    }
    return false;
  };

  const getColumnWidth = (column: DataTableColumn<T>) => {
    if (!enableColumnResize) {
      return undefined;
    }

    if (isSelectionColumn(column)) {
      return SELECTION_COLUMN_WIDTH;
    }

    const storedWidth = columnWidths[column.key];
    if (storedWidth) {
      return clampDataTableColumnWidth(column, storedWidth);
    }

    return getColumnPresetWidth(
      column,
      columnPreference.density,
      estimatedColumnContentWidths[column.key],
      getHeaderControlWidth(column)
    );
  };

  const handleColumnResizePointerDown = (column: DataTableColumn<T>, event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!enableColumnResize || !canResizeColumn(column)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const headerCell = event.currentTarget.closest("th") as HTMLTableCellElement | null;
    const startWidth = clampDataTableColumnWidth(column, getColumnWidth(column) || headerCell?.getBoundingClientRect().width || DEFAULT_COLUMN_WIDTH);
    const startX = event.clientX;
    let nextWidth = startWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = clampDataTableColumnWidth(column, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => current[column.key] === nextWidth ? current : { ...current, [column.key]: nextWidth });
    };

    const finishResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      document.body.classList.remove("is-resizing-data-table-column");
      updateColumnPreference((current) => ({
        ...current,
        columnWidths: {
          ...current.columnWidths,
          [column.key]: nextWidth
        }
      }));
    };

    document.body.classList.add("is-resizing-data-table-column");
    setColumnWidths((current) => current[column.key] === startWidth ? current : { ...current, [column.key]: startWidth });
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  };

  const resizeColumnByKeyboard = (column: DataTableColumn<T>, delta: number) => {
    const nextWidth = clampDataTableColumnWidth(column, (getColumnWidth(column) || DEFAULT_COLUMN_WIDTH) + delta);
    setColumnWidths((current) => ({ ...current, [column.key]: nextWidth }));
    updateColumnPreference((current) => ({
      ...current,
      columnWidths: {
        ...current.columnWidths,
        [column.key]: nextWidth
      }
    }));
  };

  const toggleColumn = (columnKey: string) => {
    updateColumnPreference((current) => {
      const isVisible = current.visibleColumnKeys.includes(columnKey);
      if (isVisible) {
        if (current.visibleColumnKeys.length === 1) {
          return current;
        }

        return {
          ...current,
          visibleColumnKeys: current.visibleColumnKeys.filter((key) => key !== columnKey)
        };
      }

      return {
        ...current,
        visibleColumnKeys: [...current.visibleColumnKeys, columnKey]
      };
    });
  };

  const showAllColumns = () => {
    updateColumnPreference((current) => ({
      ...current,
      visibleColumnKeys: configurableColumns.map((column) => column.key)
    }));
  };

  const setDensity = (density: NormalizedColumnPreference["density"]) => {
    const presetWidths = getPresetColumnWidths(density);
    setColumnWidths(presetWidths);
    updateColumnPreference((current) => ({
      ...current,
      columnWidths: presetWidths,
      density
    }));
  };

  const resetColumns = () => {
    const defaultPreference = normalizeColumnPreference(resolvedColumns);

    hasLocalPreferenceChangeRef.current = true;
    setIsPreferenceHydrated(true);
    setColumnPreference(defaultPreference);
    setColumnWidths(defaultPreference.columnWidths);

    if (storageKey) {
      writeStoredColumnPreference(storageKey, defaultPreference);
      lastSavedPreferenceFingerprintRef.current = `${storageKey}:${JSON.stringify(defaultPreference)}`;
      void saveWorkspacePreference(storageKey, defaultPreference).catch(() => {
        lastSavedPreferenceFingerprintRef.current = "";
      });
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortState) {
      return rows;
    }

    const sortColumn = resolvedColumns.find((column) => column.key === sortState.key);
    if (!sortColumn?.sortValue) {
      return rows;
    }

    const directionMultiplier = sortState.direction === "asc" ? 1 : -1;

    return rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftValue = sortColumn.sortValue?.(left.row);
        const rightValue = sortColumn.sortValue?.(right.row);
        const isLeftBlank = leftValue === null || leftValue === undefined || leftValue === "";
        const isRightBlank = rightValue === null || rightValue === undefined || rightValue === "";

        if (isLeftBlank || isRightBlank) {
          if (isLeftBlank && isRightBlank) {
            return left.index - right.index;
          }

          return isLeftBlank ? 1 : -1;
        }

        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue), undefined, {
                numeric: true,
                sensitivity: "base"
              });

        return comparison ? comparison * directionMultiplier : left.index - right.index;
      })
      .map(({ row }) => row);
  }, [resolvedColumns, rows, sortState]);

  const sortedRowKeys = useMemo(
    () => sortedRows.map((row, index) => String(getRowKey ? getRowKey(row, index) : index)),
    [getRowKey, sortedRows]
  );

  useEffect(() => {
    const visibleKeys = new Set(sortedRowKeys);
    setSelectedRowKeys((current) => {
      const next = new Set([...current].filter((key) => visibleKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [sortedRowKeys]);

  const selectedVisibleRowCount = useMemo(
    () => sortedRowKeys.filter((key) => selectedRowKeys.has(key)).length,
    [selectedRowKeys, sortedRowKeys]
  );
  const areAllVisibleRowsSelected = shouldRenderSelectionColumn && sortedRowKeys.length > 0 && selectedVisibleRowCount === sortedRowKeys.length;
  const areSomeVisibleRowsSelected = shouldRenderSelectionColumn && selectedVisibleRowCount > 0 && selectedVisibleRowCount < sortedRowKeys.length;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = areSomeVisibleRowsSelected;
    }
  }, [areSomeVisibleRowsSelected]);

  const toggleAllVisibleRows = () => {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (areAllVisibleRowsSelected) {
        sortedRowKeys.forEach((key) => next.delete(key));
      } else {
        sortedRowKeys.forEach((key) => next.add(key));
      }
      return next;
    });
  };

  const toggleRowSelection = (rowKey: string, checked: boolean) => {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(rowKey);
      } else {
        next.delete(rowKey);
      }
      return next;
    });
  };

  const toggleSort = (column: DataTableColumn<T>) => {
    if (!column.sortValue) {
      return;
    }

    setSortState((current) => {
      if (current?.key !== column.key) {
        return { key: column.key, direction: "asc" };
      }

      if (current.direction === "asc") {
        return { key: column.key, direction: "desc" };
      }

      return null;
    });
  };

  const normalizedColumnSearch = columnSearch.trim().toLowerCase();
  const filteredOrderedColumns = orderedColumns.filter((column) => {
    if (!normalizedColumnSearch) return true;
    return [getColumnPreferenceLabel(column), column.description, column.group, column.key]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedColumnSearch));
  });

  const columnConfigPanel = isColumnConfigOpen ? (
    <div
      className="data-table-config-panel"
      ref={columnConfigPanelRef}
      role="menu"
      style={columnConfigPanelPosition ? {
        top: columnConfigPanelPosition.top,
        right: columnConfigPanelPosition.right,
        maxHeight: columnConfigPanelPosition.maxHeight
      } : undefined}
    >
      <div className="data-table-config-head">
        <div className="data-table-config-title-row">
          <div>
            <strong>Configure columns</strong>
            <span>{columnPreference.visibleColumnKeys.length} of {configurableColumns.length} visible</span>
          </div>
          <InfoTooltip
            content="Search, show, hide, and reorder project fields. Newly available feature properties appear under Additional fields."
            label="Column configuration information"
          />
        </div>
        <label className="data-table-config-search">
          <SearchIcon size={16} />
          <input
            aria-label="Search columns"
            onChange={(event) => setColumnSearch(event.target.value)}
            placeholder="Search fields"
            type="search"
            value={columnSearch}
          />
        </label>
        <div className="data-table-config-quick-actions" role="group" aria-label="Column display preset">
          <button onClick={showAllColumns} title="Make every configurable field visible" type="button">Show all</button>
          <button onClick={resetColumns} title="Restore defined columns, order, widths, and density" type="button">Default</button>
          <button aria-pressed={columnPreference.density === "compact"} className={columnPreference.density === "compact" ? "is-active" : ""} onClick={() => setDensity("compact")} title="Fit columns toward their text while preserving readable headers" type="button">Compact</button>
          <button aria-pressed={columnPreference.density === "comfortable"} className={columnPreference.density === "comfortable" ? "is-active" : ""} onClick={() => setDensity("comfortable")} title="Give content flexible, readable column widths" type="button">Comfortable</button>
        </div>
      </div>
      <div className="data-table-config-options">
        {!filteredOrderedColumns.length ? (
          <div className="data-table-config-no-results">No fields match “{columnSearch.trim()}”.</div>
        ) : null}
        {filteredOrderedColumns.map((column, index) => {
          const columnLabel = getColumnPreferenceLabel(column);
          const isVisible = visibleColumnKeySet.has(column.key);
          const isPinned = column.canToggle === false;
          const isLastVisibleColumn = isVisible && columnPreference.visibleColumnKeys.length === 1;
          const columnGroup = column.group || "Core fields";
          const previousColumn = filteredOrderedColumns[index - 1];
          const previousGroup = previousColumn ? previousColumn.group || "Core fields" : "";

          return (
            <div className="data-table-config-option-block" key={column.key}>
              {columnGroup !== previousGroup ? <div className="data-table-config-group">{columnGroup}</div> : null}
              <div
                className={[
                  "data-table-config-option",
                  draggedColumnKey === column.key ? "is-dragging" : "",
                  isVisible ? "is-visible" : ""
                ].filter(Boolean).join(" ")}
                onDragOver={(event) => {
                  if (!draggedColumnKey || draggedColumnKey === column.key || !canReorderColumn(column) || !canReorderColumn(columnByKey[draggedColumnKey])) {
                    return;
                  }
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!draggedColumnKey || !canReorderColumn(column) || !canReorderColumn(columnByKey[draggedColumnKey])) {
                    return;
                  }

                  event.preventDefault();
                  updateColumnPreference((current) => ({
                    ...current,
                    orderedColumnKeys: moveColumnKey(current.orderedColumnKeys, draggedColumnKey, column.key)
                  }));
                  setDraggedColumnKey("");
                }}
              >
                {canReorderColumn(column) ? (
                  <span
                    aria-label={`Drag ${columnLabel} column`}
                    className="data-table-config-drag-handle"
                    draggable={!normalizedColumnSearch}
                    onDragEnd={() => setDraggedColumnKey("")}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", column.key);
                      setDraggedColumnKey(column.key);
                    }}
                    role="img"
                    title={normalizedColumnSearch ? "Clear search to reorder columns" : `Drag to reorder ${columnLabel}`}
                  >
                    <DragHandleIcon />
                  </span>
                ) : null}
                <div className="data-table-config-option-copy">
                  <strong>{columnLabel}</strong>
                  <span>{column.description || `${column.dataType || "Feature"} field`}</span>
                </div>
                {isPinned ? (
                  <span aria-label="Pinned column" className="data-table-config-option-state" title="Pinned column">
                    <PinIcon />
                  </span>
                ) : (
                  <label className="data-table-config-toggle" onClick={(event) => event.stopPropagation()} title={isLastVisibleColumn ? "At least one column must remain visible" : `${isVisible ? "Hide" : "Show"} ${columnLabel}`}>
                    <input
                      checked={isVisible}
                      disabled={isLastVisibleColumn}
                      onChange={(event) => {
                        event.stopPropagation();
                        toggleColumn(column.key);
                      }}
                      type="checkbox"
                    />
                  </label>
                )}
                {canReorderColumn(column) && !normalizedColumnSearch ? (
                  <span className="data-table-config-reorder-actions" role="group" aria-label={`Reorder ${columnLabel}`}>
                    <button aria-label={`Move ${columnLabel} up`} disabled={!canMoveColumnByOffset(column.key, -1)} onClick={() => moveColumnByOffset(column.key, -1)} type="button">↑</button>
                    <button aria-label={`Move ${columnLabel} down`} disabled={!canMoveColumnByOffset(column.key, 1)} onClick={() => moveColumnByOffset(column.key, 1)} type="button">↓</button>
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="data-table-config-actions">
        <span>{columnPreference.density === "compact" ? "Compact rows and text-fit columns" : "Comfortable rows and flexible columns"}</span>
      </div>
    </div>
  ) : null;

  const columnConfigControl = configurableColumns.length ? (
    <div className="data-table-toolbar-meta">
      <div className="data-table-config" ref={columnConfigRef}>
        <button
          aria-expanded={isColumnConfigOpen}
          aria-haspopup="menu"
          aria-label={`Configure columns (${columnPreference.visibleColumnKeys.length} visible)`}
          className="ghost-button data-table-config-trigger"
          onClick={() => {
            updateColumnConfigPanelPosition();
            setIsColumnConfigOpen((current) => !current);
          }}
          ref={columnConfigTriggerRef}
          title={`Configure columns (${columnPreference.visibleColumnKeys.length} visible)`}
          type="button"
        >
          <ColumnsIcon />
        </button>
        {columnConfigPanel && typeof document !== "undefined" ? createPortal(columnConfigPanel, document.body) : null}
      </div>
    </div>
  ) : null;

  const resizableTableWidth = enableColumnResize
    ? activeColumns.reduce((width, column) => width + (getColumnWidth(column) || 0), shouldRenderSelectionColumn ? SELECTION_COLUMN_WIDTH : 0)
      + (columnConfigControl ? COLUMN_CONFIG_WIDTH : 0)
    : undefined;

  return (
    <div className={`data-table-shell data-table-shell--${columnPreference.density}`}>
      {!rows.length ? <div className="empty-state">{emptyMessage}</div> : null}

      {rows.length ? (
        <div className="table-wrap catalog-table-wrap">
          <table
            className={["data-table catalog-data-table", enableColumnResize ? "is-resizable" : ""].filter(Boolean).join(" ")}
            style={resizableTableWidth ? { width: `${resizableTableWidth}px` } : undefined}
          >
            {enableColumnResize ? (
              <colgroup>
                {shouldRenderSelectionColumn ? <col className="data-table-selection-col" /> : null}
                {activeColumns.map((column) => (
                  <col
                    className={isSelectionColumn(column) ? "data-table-selection-col" : undefined}
                    key={column.key}
                    style={{ width: `${getColumnWidth(column)}px` }}
                  />
                ))}
                {columnConfigControl ? <col className="data-table-control-col" /> : null}
              </colgroup>
            ) : null}
            <thead>
              <tr>
                {shouldRenderSelectionColumn ? (
                  <th className="data-table-select-header" scope="col">
                    <label className="data-table-header-checkbox" onClick={(event) => event.stopPropagation()}>
                      <input
                        aria-label={areAllVisibleRowsSelected ? "Clear all visible rows" : "Select all visible rows"}
                        checked={areAllVisibleRowsSelected}
                        onChange={toggleAllVisibleRows}
                        ref={selectAllCheckboxRef}
                        type="checkbox"
                      />
                    </label>
                  </th>
                ) : null}
                {activeColumns.map((column) => (
                  <th
                    className={[
                      isSelectionColumn(column) ? "data-table-select-header" : "",
                      enableHeaderColumnReorder && canReorderColumn(column) ? "is-draggable-column" : "",
                      draggedColumnKey === column.key ? "is-header-dragging" : ""
                    ].filter(Boolean).join(" ")}
                    key={column.key}
                    onDragOver={(event) => {
                      if (!enableHeaderColumnReorder || !draggedColumnKey || draggedColumnKey === column.key || !canReorderColumn(column) || !canReorderColumn(columnByKey[draggedColumnKey])) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      if (!enableHeaderColumnReorder || !draggedColumnKey || !canReorderColumn(column) || !canReorderColumn(columnByKey[draggedColumnKey])) {
                        return;
                      }

                      event.preventDefault();
                      moveColumn(draggedColumnKey, column.key);
                      setDraggedColumnKey("");
                    }}
                    aria-sort={
                      sortState?.key === column.key
                        ? (sortState.direction === "asc" ? "ascending" : "descending")
                        : undefined
                    }
                    style={enableColumnResize ? { width: `${getColumnWidth(column)}px` } : undefined}
                  >
                    <div className="data-table-column-header">
                      <div
                        className="data-table-column-drag-area"
                      >
                        {enableHeaderColumnReorder && canReorderColumn(column) ? (
                          <span
                            aria-label={`Drag ${getColumnPreferenceLabel(column)} column`}
                            className="data-table-header-drag-handle"
                            draggable
                            onDragEnd={() => setDraggedColumnKey("")}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", column.key);
                              setDraggedColumnKey(column.key);
                            }}
                            role="img"
                            title={`Drag to reorder ${getColumnPreferenceLabel(column)}`}
                          >
                            <DragHandleIcon />
                          </span>
                        ) : null}
                        {column.headerRender ? column.headerRender() : (
                          column.sortValue ? (
                            <button
                              className="data-table-header-sort-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSort(column);
                              }}
                              title={`Sort by ${getColumnPreferenceLabel(column)}`}
                              type="button"
                            >
                              <span className="data-table-header-label">{column.label}</span>
                              <span
                                aria-hidden="true"
                                className={[
                                  "data-table-sort-indicator",
                                  sortState?.key === column.key ? "is-active" : "",
                                  sortState?.key === column.key && sortState.direction === "desc" ? "is-desc" : "is-asc"
                                ].filter(Boolean).join(" ")}
                              >
                                <DataTableSortArrowIcon />
                              </span>
                            </button>
                          ) : <span className="data-table-header-label">{column.label}</span>
                        )}
                      </div>
                      {enableColumnResize && canResizeColumn(column) ? (
                        <span
                          aria-label={`Resize ${getColumnPreferenceLabel(column)} column`}
                          aria-orientation="vertical"
                          aria-valuemax={column.maxWidth || DEFAULT_MAX_COLUMN_WIDTH}
                          aria-valuemin={getDataTableColumnMinimumWidth(column)}
                          aria-valuenow={getColumnWidth(column)}
                          className="data-table-column-resize-handle"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowLeft") {
                              event.preventDefault();
                              resizeColumnByKeyboard(column, -16);
                            }
                            if (event.key === "ArrowRight") {
                              event.preventDefault();
                              resizeColumnByKeyboard(column, 16);
                            }
                          }}
                          onPointerDown={(event) => handleColumnResizePointerDown(column, event)}
                          role="separator"
                          tabIndex={0}
                          title={`Resize ${getColumnPreferenceLabel(column)} column`}
                        />
                      ) : null}
                    </div>
                  </th>
                ))}
                {columnConfigControl ? (
                  <th className="data-table-control-header" scope="col">
                    {columnConfigControl}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => {
                const rowKey = sortedRowKeys[index] || String(index);
                const rowClassName = [getRowClassName?.(row), onRowClick ? "is-clickable-row" : ""].filter(Boolean).join(" ");
                const isRowDraggable = getRowDraggable?.(row) || false;

                return (
                  <tr
                    className={rowClassName}
                    draggable={isRowDraggable || undefined}
                    key={rowKey}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onDragEnd={isRowDraggable ? () => onRowDragEnd?.(row) : undefined}
                    onDragStart={isRowDraggable ? (event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", rowKey);
                      onRowDragStart?.(row, event);
                    } : undefined}
                  >
                    {shouldRenderSelectionColumn ? (
                      <td className="data-table-select-cell" onClick={(event) => event.stopPropagation()}>
                        <label className="data-table-row-checkbox">
                          <input
                            aria-label={`Select row ${index + 1}`}
                            checked={selectedRowKeys.has(rowKey)}
                            onChange={(event) => toggleRowSelection(rowKey, event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                      </td>
                    ) : null}
                    {activeColumns.map((column) => (
                      <td
                        className={isSelectionColumn(column) ? "data-table-select-cell" : undefined}
                        key={column.key}
                        onClick={isSelectionColumn(column) ? (event) => event.stopPropagation() : undefined}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                    {columnConfigControl ? <td aria-hidden="true" className="data-table-control-cell" /> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function DataTableSortArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="M12 5v14" />
      <path d="m7 10 5-5 5 5" />
    </svg>
  );
}
