export type ColumnDensity = "comfortable" | "compact";

export type SizableColumn = {
  key: string;
  label?: string;
  maxWidth?: number;
  minWidth?: number;
  preferenceLabel?: string;
  width?: number;
};

export const DEFAULT_COLUMN_WIDTH = 136;
export const DEFAULT_MIN_COLUMN_WIDTH = 64;
export const DEFAULT_MAX_COLUMN_WIDTH = 640;

const COLUMN_HEADER_CHARACTER_WIDTH = 8;
const COLUMN_HEADER_CHROME_WIDTH = 40;
const COLUMN_CELL_CHARACTER_WIDTH = 7;
const COLUMN_CELL_CHROME_WIDTH = 28;
const COMPACT_AUTO_MAX_WIDTH = 240;
const COMFORTABLE_AUTO_MAX_WIDTH = 440;
const COMPACT_DEFINITION_RATIO = 0.72;

const asFinitePositiveNumber = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

export const getColumnMinimumWidth = <Column extends SizableColumn>(
  column: Column,
  headerControlWidth = 0
) => {
  const headerLabel = String(column.label || column.preferenceLabel || column.key).trim();
  const headerWidth = headerLabel
    ? Array.from(headerLabel).length * COLUMN_HEADER_CHARACTER_WIDTH + COLUMN_HEADER_CHROME_WIDTH + Math.max(0, headerControlWidth)
    : DEFAULT_MIN_COLUMN_WIDTH;

  return Math.max(DEFAULT_MIN_COLUMN_WIDTH, column.minWidth || 0, headerWidth);
};

export const clampColumnWidth = <Column extends SizableColumn>(
  column: Column,
  width: number,
  headerControlWidth = 0
) => {
  const minWidth = getColumnMinimumWidth(column, headerControlWidth);
  const maxWidth = Math.max(minWidth, column.maxWidth || DEFAULT_MAX_COLUMN_WIDTH);
  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)));
};

export const estimateColumnContentWidth = (values: unknown[]) => {
  const longestTextLength = values.reduce<number>((longest, value) => {
    if (value === null || value === undefined) return longest;
    const text = Array.isArray(value)
      ? value.join(", ")
      : typeof value === "object"
        ? ""
        : String(value);
    return Math.max(longest, Array.from(text).length);
  }, 0);

  return longestTextLength
    ? longestTextLength * COLUMN_CELL_CHARACTER_WIDTH + COLUMN_CELL_CHROME_WIDTH
    : DEFAULT_COLUMN_WIDTH;
};

/**
 * Resolves a deterministic width for a display preset. Comfortable honors the
 * column definition and gives representative content room to breathe. Compact
 * moves toward the measured text width while retaining header and explicit
 * minimum-width guarantees. Persisted manual resize values continue to win in
 * the table until another density preset is explicitly selected.
 */
export const getColumnPresetWidth = <Column extends SizableColumn>(
  column: Column,
  density: ColumnDensity,
  estimatedContentWidth = DEFAULT_COLUMN_WIDTH,
  headerControlWidth = 0
) => {
  const definitionWidth = asFinitePositiveNumber(column.width);
  const measuredWidth = asFinitePositiveNumber(estimatedContentWidth) || DEFAULT_COLUMN_WIDTH;

  if (density === "compact") {
    const definitionCeiling = definitionWidth
      ? definitionWidth * COMPACT_DEFINITION_RATIO
      : COMPACT_AUTO_MAX_WIDTH;
    const compactWidth = Math.min(measuredWidth, definitionCeiling, COMPACT_AUTO_MAX_WIDTH);
    return clampColumnWidth(column, compactWidth, headerControlWidth);
  }

  const comfortableWidth = Math.max(
    definitionWidth || DEFAULT_COLUMN_WIDTH,
    Math.min(measuredWidth, COMFORTABLE_AUTO_MAX_WIDTH)
  );
  return clampColumnWidth(column, comfortableWidth, headerControlWidth);
};

export const buildColumnPresetWidths = <Column extends SizableColumn>(
  columns: Column[],
  density: ColumnDensity,
  estimatedContentWidths: Record<string, number>,
  getHeaderControlWidth: (column: Column) => number = () => 0
) => columns.reduce<Record<string, number>>((widths, column) => {
  widths[column.key] = getColumnPresetWidth(
    column,
    density,
    estimatedContentWidths[column.key],
    getHeaderControlWidth(column)
  );
  return widths;
}, {});
