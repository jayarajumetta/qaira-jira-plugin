import { readSheet } from "read-excel-file/browser";
import { parseCsvGrid } from "./csvGrid";

export type ParsedTestDataFile = {
  columns: string[];
  rows: Array<Record<string, string>>;
  warnings: string[];
};

const INVALID_DATA_SET_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const sanitizeCellValue = (value: unknown) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(INVALID_DATA_SET_CHAR_PATTERN, "");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringifyCellValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return sanitizeCellValue(value);
  }

  return sanitizeCellValue(JSON.stringify(value));
};

function makeUniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();

  return headers.map((header, index) => {
    const base = header.trim() || `Column ${index + 1}`;
    const nextCount = (seen.get(base) || 0) + 1;
    seen.set(base, nextCount);
    return nextCount === 1 ? base : `${base} ${nextCount}`;
  });
}

function normalizeGrid(grid: unknown[][]) {
  return grid
    .map((row) => row.map((cell) => sanitizeCellValue(cell)))
    .filter((row) => row.some((cell) => cell.trim().length));
}

function objectRowsToTable(rows: Array<Record<string, unknown>>, explicitColumns: unknown[] = []): ParsedTestDataFile {
  const rawColumns = explicitColumns.length
    ? explicitColumns.map((column) => sanitizeCellValue(column)).filter((column) => column.trim())
    : rows.reduce<string[]>((accumulator, row) => {
        Object.keys(row).forEach((key) => {
          if (!accumulator.includes(key)) {
            accumulator.push(key);
          }
        });
        return accumulator;
      }, []);
  const columns = makeUniqueHeaders(rawColumns);

  return {
    columns,
    rows: rows
      .map((row) =>
        columns.reduce<Record<string, string>>((accumulator, column, index) => {
          const rawColumn = rawColumns[index] || column;
          accumulator[column] = stringifyCellValue(row[rawColumn]);
          return accumulator;
        }, {})
      )
      .filter((row) => Object.values(row).some((value) => value.trim())),
    warnings: []
  };
}

function arrayRowsToTable(rows: unknown[][], explicitColumns: unknown[] = []): ParsedTestDataFile {
  const columnCount = Math.max(explicitColumns.length, ...rows.map((row) => row.length), 1);
  const columns = makeUniqueHeaders(
    Array.from({ length: columnCount }, (_, index) => sanitizeCellValue(explicitColumns[index] ?? `Column ${index + 1}`))
  );

  return {
    columns,
    rows: rows
      .map((row) =>
        columns.reduce<Record<string, string>>((accumulator, column, index) => {
          accumulator[column] = stringifyCellValue(row[index]);
          return accumulator;
        }, {})
      )
      .filter((row) => Object.values(row).some((value) => value.trim())),
    warnings: []
  };
}

function primitiveArrayToTable(rows: unknown[]): ParsedTestDataFile {
  return {
    columns: ["value"],
    rows: rows.map((value) => ({ value: stringifyCellValue(value) })).filter((row) => row.value.trim()),
    warnings: []
  };
}

function objectToKeyValueTable(value: Record<string, unknown>): ParsedTestDataFile {
  return {
    columns: ["key", "value"],
    rows: Object.entries(value)
      .map(([key, entryValue]) => ({
        key: sanitizeCellValue(key).trim(),
        value: stringifyCellValue(entryValue)
      }))
      .filter((row) => row.key),
    warnings: []
  };
}

function parseJsonPayload(payload: unknown): ParsedTestDataFile {
  const source = isPlainObject(payload) && Array.isArray(payload.rows)
    ? payload.rows
    : isPlainObject(payload) && Array.isArray(payload.data)
      ? payload.data
      : payload;
  const explicitColumns = isPlainObject(payload) && Array.isArray(payload.columns) ? payload.columns : [];

  if (Array.isArray(source)) {
    if (!source.length) {
      return {
        columns: [],
        rows: [],
        warnings: ["The JSON file is empty."]
      };
    }

    if (source.every((row) => isPlainObject(row))) {
      return objectRowsToTable(source as Array<Record<string, unknown>>, explicitColumns);
    }

    if (source.every((row) => Array.isArray(row))) {
      return arrayRowsToTable(source as unknown[][], explicitColumns);
    }

    return primitiveArrayToTable(source);
  }

  if (isPlainObject(source)) {
    return objectToKeyValueTable(source);
  }

  return primitiveArrayToTable([source]);
}

export async function parseJsonFile(file: File): Promise<ParsedTestDataFile> {
  let payload: unknown;

  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("Unable to read this JSON file. Upload a valid .json file before creating test data.");
  }

  const parsed = parseJsonPayload(payload);

  if (!parsed.columns.length || !parsed.rows.length) {
    throw new Error("The JSON file does not contain any usable test data. Upload an object, an array of objects, or a JSON object with columns and rows.");
  }

  return parsed;
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedTestDataFile> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xls")) {
    throw new Error("Legacy .xls files are not accepted because their parser is not security-maintained. Save the workbook as .xlsx or .csv and upload it again.");
  }

  try {
    const isCsv = lowerName.endsWith(".csv") || file.type === "text/csv";
    const rawText = isCsv ? await file.text() : "";
    const rawGrid = isCsv ? parseCsvGrid(rawText) : await readSheet(file);
    const grid = normalizeGrid(rawGrid);

    if (!grid.length) {
      return {
        columns: [],
        rows: [],
        warnings: ["The spreadsheet is empty."]
      };
    }

    const warnings: string[] = [];
    const rawContent = isCsv ? rawText : rawGrid.flat().map((cell) => String(cell ?? "")).join("\n");
    const sanitizedRawText = sanitizeCellValue(rawContent);

    if (rawContent !== sanitizedRawText) {
      warnings.push("Invalid control characters were removed while importing this spreadsheet.");
    }

    const columns = makeUniqueHeaders(grid[0]);
    const rows = grid
      .slice(1)
      .map((row) => {
        const normalizedRow: Record<string, string> = {};

        columns.forEach((column, index) => {
          normalizedRow[column] = sanitizeCellValue(row[index] ?? "");
        });

        return normalizedRow;
      })
      .filter((row) => Object.values(row).some((value) => value.trim()));

    if (rows.length) {
      return {
        columns,
        rows,
        warnings
      };
    }

    if (grid.length === 1) {
      const fallbackColumns = makeUniqueHeaders(grid[0].map((_, index) => `Column ${index + 1}`));
      const fallbackRows = [
        fallbackColumns.reduce<Record<string, string>>((accumulator, column, index) => {
          accumulator[column] = sanitizeCellValue(grid[0][index] ?? "");
          return accumulator;
        }, {})
      ];

      return {
        columns: fallbackColumns,
        rows: fallbackRows,
        warnings: [...warnings, "No header row was detected, so QAira generated column names automatically."]
      };
    }

    return {
      columns,
      rows: [],
      warnings: [...warnings, "The spreadsheet did not produce any populated data rows."]
    };
  } catch {
    throw new Error("Unable to read this spreadsheet. Upload a valid .xlsx or .csv file with a readable first sheet.");
  }
}

export async function parseTestDataFile(file: File): Promise<ParsedTestDataFile> {
  if (file.name.toLowerCase().endsWith(".json") || file.type === "application/json") {
    return parseJsonFile(file);
  }

  return parseSpreadsheetFile(file);
}

export function toKeyValueRows(columns: string[], rows: Array<Record<string, string>>) {
  const normalizedColumns = columns.map((column) => column.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const keyColumn = columns[normalizedColumns.findIndex((column) => ["key", "name", "variable", "field"].includes(column))] || columns[0] || "key";
  const valueColumn = columns[normalizedColumns.findIndex((column) => ["value", "data", "content"].includes(column))] || columns[1] || columns[0] || "value";

  return rows
    .map((row) => ({
      key: sanitizeCellValue(row[keyColumn] ?? "").trim(),
      value: sanitizeCellValue(row[valueColumn] ?? "")
    }))
    .filter((row) => row.key);
}
