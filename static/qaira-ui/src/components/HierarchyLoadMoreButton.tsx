type HierarchyLoadMoreButtonProps = {
  batchSize: number;
  isLoading: boolean;
  loaded?: number;
  onLoad: () => void | Promise<unknown>;
  scopeLabel: string;
  total?: number;
};

export function HierarchyLoadMoreButton({
  batchSize,
  isLoading,
  loaded,
  onLoad,
  scopeLabel,
  total
}: HierarchyLoadMoreButtonProps) {
  const hasProgress = Number.isFinite(loaded) && Number.isFinite(total);
  const progress = hasProgress ? ` (${loaded}/${total})` : "";

  return (
    <button
      aria-label={isLoading ? `Loading more ${scopeLabel}` : `Load ${batchSize} more ${scopeLabel}`}
      className="ghost-button compact hierarchy-load-more-button"
      disabled={isLoading}
      onClick={() => void onLoad()}
      type="button"
    >
      {isLoading ? "Loading…" : `Load ${batchSize} more${progress}`}
    </button>
  );
}
