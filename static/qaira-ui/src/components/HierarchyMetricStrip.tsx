export type HierarchyMetric = {
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "info" | "warning" | "danger";
  title?: string;
};

export function HierarchyMetricStrip({
  count,
  noun,
  metrics
}: {
  count: number;
  noun: string;
  metrics: HierarchyMetric[];
}) {
  return (
    <div className="hierarchy-metric-strip" aria-label={`${count} ${noun}${count === 1 ? "" : "s"} and derived health metrics`}>
      <span className="hierarchy-record-count">
        <strong>{count}</strong>
        <small>{noun}{count === 1 ? "" : "s"}</small>
      </span>
      {metrics.map((metric) => (
        <span
          className={`hierarchy-metric tone-${metric.tone || "neutral"}`}
          key={metric.label}
          title={metric.title}
        >
          <small>{metric.label}</small>
          <strong>{metric.value}</strong>
        </span>
      ))}
    </div>
  );
}
