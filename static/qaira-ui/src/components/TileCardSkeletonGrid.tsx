export function TileCardSkeletonGrid({
  className = "",
  count = 3
}: {
  className?: string;
  count?: number;
}) {
  return (
    <div
      aria-label="Loading tiles"
      className={["tile-browser-grid", className].filter(Boolean).join(" ")}
      role="status"
    >
      {Array.from({ length: count }, (_, index) => (
        <div aria-hidden="true" className="skeleton-block tile-card-skeleton" key={index} />
      ))}
    </div>
  );
}
