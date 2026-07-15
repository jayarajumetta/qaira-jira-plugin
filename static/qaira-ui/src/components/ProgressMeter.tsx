export function ProgressMeter({
  value,
  label,
  detail,
  tone = "info",
  segments,
  hideCopy = false
}: {
  value: number;
  label?: string;
  detail?: string;
  tone?: "info" | "success" | "danger" | "neutral";
  segments?: Array<{
    value: number;
    tone: "success" | "danger" | "neutral" | "info";
  }>;
  hideCopy?: boolean;
}) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const normalizedSegments = (segments || [])
    .map((segment) => ({
      ...segment,
      value: Math.max(0, Math.min(100, segment.value))
    }))
    .filter((segment) => segment.value > 0);

  return (
    <div className="progress-meter" aria-label={label || `${safeValue}%`}>
      <div className="progress-meter-track">
        {normalizedSegments.length ? (
          normalizedSegments.map((segment, index) => (
            <div
              className={`progress-meter-segment is-${segment.tone}`}
              key={`${segment.tone}-${index}`}
              style={{ width: `${segment.value}%` }}
            />
          ))
        ) : (
          <div className={`progress-meter-fill is-${tone}`} style={{ width: `${safeValue}%` }} />
        )}
      </div>
      {!hideCopy ? (
        <div className="progress-meter-copy">
          <strong>{safeValue}%</strong>
          {label ? <span>{label}</span> : null}
          {detail ? <small>{detail}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
