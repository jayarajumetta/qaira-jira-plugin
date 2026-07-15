const csvCell = (value: unknown) => {
  const serialized = value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  return `"${serialized.replace(/"/g, '""')}"`;
};

export function downloadCsvRecords(fileName: string, records: Array<Record<string, unknown>>) {
  if (!records.length) {
    return;
  }

  const columns = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
  const content = [
    columns.map(csvCell).join(","),
    ...records.map((record) => columns.map((column) => csvCell(record[column])).join(","))
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
