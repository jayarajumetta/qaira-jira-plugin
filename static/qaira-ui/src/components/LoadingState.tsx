export function LoadingState({
  label = "Loading",
  description
}: {
  label?: string;
  description?: string;
}) {
  return (
    <div aria-label={label} aria-live="polite" className="loading-state" role="status">
      <span className="loading-state-visual" aria-hidden="true">
        <span className="loading-state-spinner" />
        <span className="loading-state-core" />
      </span>
      <span className="loading-state-copy">
        <strong className="loading-state-label">{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </div>
  );
}
