import { useEffect, useId, useRef, useState } from "react";
import { BugIcon, SparkIcon } from "./AppIcons";

export function ReportBugSplitActionButton({
  canUseAi = false,
  className = "",
  disabled = false,
  onReportBug,
  onReportBugWithAi
}: {
  canUseAi?: boolean;
  className?: string;
  disabled?: boolean;
  onReportBug: () => void;
  onReportBugWithAi?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const showAiAction = canUseAi && Boolean(onReportBugWithAi);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div
      className={[
        "create-run-action-button",
        "report-bug-split-action-button",
        "issue-report-split",
        showAiAction ? "" : "is-single",
        className
      ].filter(Boolean).join(" ")}
      ref={rootRef}
    >
      <button className="run-action-main issue-report-split-main" disabled={disabled} onClick={onReportBug} type="button">
        <BugIcon />
        <span>Report Bug</span>
      </button>
      {showAiAction ? (
        <>
          <button
            aria-expanded={isOpen}
            aria-controls={menuId}
            aria-haspopup="menu"
            aria-label="More bug reporting options"
            className="run-action-toggle issue-report-split-toggle"
            disabled={disabled}
            onClick={() => setIsOpen((current) => !current)}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
              <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
          {isOpen ? (
            <div className="issue-report-split-menu" id={menuId} role="menu">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onReportBugWithAi?.();
                }}
                role="menuitem"
                type="button"
              >
                <SparkIcon />
                <span>
                  <strong>Report Bug using AI</strong>
                  <small>Draft from the selected run scope and evidence, then review before saving.</small>
                </span>
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
