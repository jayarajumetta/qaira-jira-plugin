import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { hasPermission } from "../lib/permissions";
import { PlayIcon } from "./AppIcons";

export type CreateRunSource = "TEST_CASES" | "TEST_SUITES" | "TEST_RUNS";
export type CreateRunMode = "MANUAL" | "LOCAL" | "REMOTE";

export interface CreateRunActionButtonProps {
  source: CreateRunSource;
  selectedTestCaseIds?: string[];
  selectedSuiteIds?: string[];
  selectedRunIds?: string[];
  className?: string;
  disabled?: boolean;
  label?: string;
  onCreateManualRun: () => void;
  onCreateLocalRun: () => void;
  onCreateRemoteRun: () => void;
}

function RunActionChevronIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function CreateRunActionButton({
  source,
  className = "",
  disabled = false,
  label = "Create Manual Run",
  onCreateManualRun,
  onCreateLocalRun,
  onCreateRemoteRun
}: CreateRunActionButtonProps) {
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canCreateManualRuns = hasPermission(session, "run.create")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.manual.runs"]);
  const canCreateLocalRuns = hasPermission(session, "automation.run.local")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace", "qaira.automation.local_execution"]);
  const canCreateRemoteRuns = hasPermission(session, "automation.run.remote")
    && areFeatureFlagsEnabled(featureFlagsQuery.data, ["qaira.automation.workspace", "qaira.automation.remote_execution"]);
  const isManualDisabled = disabled || !canCreateManualRuns;
  const canOpenMenu = !disabled && (canCreateLocalRuns || canCreateRemoteRuns);

  useEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const menuWidth = Math.max(menuRef.current?.offsetWidth || 292, 292);
      const menuHeight = menuRef.current?.offsetHeight || 190;
      const viewportPadding = 10;
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding
      );
      const bottomTop = rect.bottom + 8;
      const top = bottomTop + menuHeight > window.innerHeight - viewportPadding
        ? Math.max(viewportPadding, rect.top - menuHeight - 8)
        : bottomTop;

      setMenuStyle({
        left,
        top,
        minWidth: "18.25rem",
        maxWidth: "min(calc(100vw - 1.25rem), 23rem)",
        opacity: 1
      });
    };

    updateMenuPosition();
    const frameId = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (mode: CreateRunMode) => {
    setIsOpen(false);
    if (mode === "LOCAL") {
      onCreateLocalRun();
      return;
    }
    if (mode === "REMOTE") {
      onCreateRemoteRun();
      return;
    }
    onCreateManualRun();
  };

  const menu = isOpen && canOpenMenu ? (
    <div
      className={`run-action-dropdown run-action-dropdown--${source.toLowerCase().replace(/_/g, "-")}`}
      ref={menuRef}
      role="menu"
      style={menuStyle || { opacity: 0, pointerEvents: "none" }}
    >
      <button disabled={!canCreateLocalRuns} onClick={() => handleSelect("LOCAL")} role="menuitem" type="button">
        <span className="run-action-option-icon"><PlayIcon /></span>
        <strong>Local Run</strong>
      </button>
      <button disabled={!canCreateRemoteRuns} onClick={() => handleSelect("REMOTE")} role="menuitem" type="button">
        <span className="run-action-option-icon"><PlayIcon /></span>
        <strong>Remote Run</strong>
      </button>
    </div>
  ) : null;

  return (
    <div
      className={[
        "create-run-action-button",
        `create-run-action-button--${source.toLowerCase().replace(/_/g, "-")}`,
        className
      ].filter(Boolean).join(" ")}
      ref={triggerRef}
    >
      <button
        className="run-action-main issue-report-split-main"
        disabled={isManualDisabled}
        onClick={() => handleSelect("MANUAL")}
        type="button"
      >
        <PlayIcon />
        <span>{label}</span>
      </button>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Open create run options"
        className="run-action-toggle"
        disabled={!canOpenMenu}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <RunActionChevronIcon />
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}
