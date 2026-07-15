const formatDisplayId = (value: string) => value.replace(/^RC([_-]?)/i, "Req$1");

export function DisplayIdBadge({ value }: { value: string }) {
  return (
    <span className="display-id-badge">
      <code>{formatDisplayId(value)}</code>
    </span>
  );
}
