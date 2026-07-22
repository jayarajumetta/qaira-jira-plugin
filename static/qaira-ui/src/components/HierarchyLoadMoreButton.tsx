type HierarchyLoadMoreButtonProps = {
  actionLabel?: string;
  isLoading: boolean;
  loaded?: number;
  onLoad: () => void | Promise<unknown>;
  placement?: "inline" | "footer";
  scopeLabel: string;
  total?: number;
};

export function HierarchyLoadMoreButton({
  actionLabel = "Load more",
  isLoading,
  loaded,
  onLoad,
  placement = "inline",
  scopeLabel,
  total
}: HierarchyLoadMoreButtonProps) {
  const hasProgress = Number.isFinite(loaded) && Number.isFinite(total);
  const progress = hasProgress && Number(total) > Number(loaded)
    ? ` · ${loaded} of ${total} loaded`
    : Number.isFinite(loaded) && Number(loaded) > 0
      ? ` · ${loaded} loaded`
      : "";

  return (
    <button
      aria-busy={isLoading}
      aria-label={isLoading ? `Loading more ${scopeLabel}` : `${actionLabel} ${scopeLabel}`}
      className={`${placement === "footer" ? "primary-button" : "ghost-button"} compact hierarchy-load-more-button hierarchy-load-more-button--${placement}`}
      disabled={isLoading}
      onClick={() => void onLoad()}
      type="button"
    >
      {isLoading ? <><span aria-hidden="true" className="button-spinner" /><span>Loading…</span></> : `${actionLabel}${progress}`}
    </button>
  );
}
