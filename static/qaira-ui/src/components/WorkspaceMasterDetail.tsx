import type { ReactNode } from "react";

export function WorkspaceMasterDetail({
  browseView,
  className = "",
  detailView,
  isDetailOpen,
  variant = "switch"
}: {
  browseView: ReactNode;
  className?: string;
  detailView: ReactNode;
  isDetailOpen: boolean;
  variant?: "switch" | "split";
}) {
  if (variant === "split") {
    return (
      <div className={["workspace-master-detail workspace-master-detail--split", isDetailOpen ? "is-detail-open" : "is-browse-open", className].filter(Boolean).join(" ")}>
        <div className="workspace-master-detail-panel workspace-master-detail-browse-panel">
          {browseView}
        </div>
        <div className="workspace-master-detail-panel workspace-master-detail-detail-panel">
          {detailView}
        </div>
      </div>
    );
  }

  return (
    <div className={["workspace-master-detail", isDetailOpen ? "is-detail-open" : "is-browse-open", className].filter(Boolean).join(" ")}>
      <div className="workspace-master-detail-panel">
        {isDetailOpen ? detailView : browseView}
      </div>
    </div>
  );
}

export function WorkspaceBackButton({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-label={label} className="ghost-button workspace-back-button" onClick={onClick} title="Back" type="button">
      <WorkspaceBackIcon />
      <span>Back</span>
    </button>
  );
}

function WorkspaceBackIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
      <path d="m15 18-6-6 6-6" />
      <path d="M9 12h10" />
    </svg>
  );
}
