export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div aria-label={label} aria-live="polite" className="loading-state" role="status">
      <span className="loading-state-spinner" aria-hidden="true" />
      <span className="loading-state-label">{label}</span>
    </div>
  );
}
