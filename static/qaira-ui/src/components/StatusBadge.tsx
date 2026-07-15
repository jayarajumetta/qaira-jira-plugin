export function StatusBadge({ value }: { value: string | null | undefined }) {
  const className = `status-badge ${String(value || "default").toLowerCase()}`;
  return <span className={className}>{value || "unknown"}</span>;
}
