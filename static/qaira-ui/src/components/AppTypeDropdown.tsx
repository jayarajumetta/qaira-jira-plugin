import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CSSProperties } from "react";
import type { AppType } from "../types";
import { LayersIcon } from "./AppIcons";
import { StepTypeIcon } from "./StepAutomationEditor";

export type AppTypeDropdownOption = {
  value: string;
  label: string;
  type?: string | null;
  isUnified?: boolean | number | null;
  description?: string | null;
};

type AppTypeDropdownProps = {
  options: AppTypeDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

type MenuPosition = {
  width: number;
  maxHeight: number;
};

const VIEWPORT_PADDING = 12;
const APP_TYPE_KIND_SET = new Set<AppType["type"]>(["web", "api", "android", "ios", "unified"]);

export function normalizeAppTypeKind(
  type?: string | null,
  isUnified?: boolean | number | null,
  fallback: AppType["type"] = "web"
): AppType["type"] {
  const normalized = String(type || "").trim().toLowerCase() as AppType["type"];

  if (normalized === "unified" || Boolean(isUnified)) {
    return "unified";
  }

  return APP_TYPE_KIND_SET.has(normalized) ? normalized : fallback;
}

export function UnifiedAppTypeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.85"
      viewBox="0 0 24 24"
      width={size}
    >
      <rect height="9" rx="2" width="11" x="3.5" y="5" />
      <path d="M3.5 8h11" />
      <rect height="11" rx="2.5" width="6.5" x="14" y="8.5" />
      <circle cx="17.25" cy="16.75" fill="currentColor" r=".8" stroke="none" />
      <path d="M8 17.5h3" />
    </svg>
  );
}

export function AppTypeIcon({
  type,
  isUnified,
  size = 16
}: {
  type?: string | null;
  isUnified?: boolean | number | null;
  size?: number;
}) {
  const kind = normalizeAppTypeKind(type, isUnified);

  if (kind === "unified") {
    return <UnifiedAppTypeIcon size={size} />;
  }

  return <StepTypeIcon size={size} type={kind} />;
}

export function AppTypeInlineValue({
  label,
  type,
  isUnified,
  className = ""
}: {
  label: string;
  type?: string | null;
  isUnified?: boolean | number | null;
  className?: string;
}) {
  const hasSpecificIcon = Boolean(type) || Boolean(isUnified);

  return (
    <span className={["app-type-inline-value", className].filter(Boolean).join(" ")}>
      <span aria-hidden="true" className="app-type-inline-icon">
        {hasSpecificIcon ? <AppTypeIcon isUnified={isUnified} size={16} type={type} /> : <LayersIcon size={16} />}
      </span>
      <span className="app-type-inline-text">{label}</span>
    </span>
  );
}

export function AppTypeDropdown({
  options,
  value,
  onChange,
  ariaLabel,
  placeholder = "Select app type",
  emptyLabel = "No app types available",
  disabled = false,
  name,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid
}: AppTypeDropdownProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || null,
    [options, value]
  );
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value]
  );

  const updateMenuPosition = () => {
    if (!triggerRef.current || typeof window === "undefined") {
      return;
    }

    const triggerBounds = triggerRef.current.getBoundingClientRect();
    const width = Math.min(triggerBounds.width, window.innerWidth - VIEWPORT_PADDING * 2);
    const maxHeight = Math.max(168, window.innerHeight - triggerBounds.bottom - VIEWPORT_PADDING);

    setMenuPosition({
      width,
      maxHeight
    });
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!options.length || disabled) {
      setIsOpen(false);
    }
  }, [disabled, options.length]);

  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1);
      return;
    }

    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen || highlightedIndex < 0) {
      return;
    }

    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, isOpen]);

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !options.length) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : options.length - 1);
    }
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index + 1) % options.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index - 1 + options.length) % options.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  const menuStyle: CSSProperties | undefined = menuPosition
    ? {
        position: "absolute",
        top: "calc(100% + 0.35rem)",
        left: 0,
        width: `${menuPosition.width}px`,
        maxHeight: `${menuPosition.maxHeight}px`
      }
    : undefined;
  const triggerLabel = selectedOption?.label || (options.length ? placeholder : emptyLabel);
  const isPlaceholder = !selectedOption;

  return (
    <div className="app-type-dropdown">
      {name ? <input name={name} readOnly type="hidden" value={value} /> : null}
      <button
        ref={triggerRef}
        aria-controls={isOpen ? listboxId : undefined}
        aria-describedby={ariaDescribedBy}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        className={["app-type-dropdown-trigger", isPlaceholder ? "is-placeholder" : ""].filter(Boolean).join(" ")}
        disabled={disabled || !options.length}
        id={id}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <span className="app-type-dropdown-selection">
          <span aria-hidden="true" className="app-type-inline-icon">
            {selectedOption ? (
              <AppTypeIcon isUnified={selectedOption.isUnified} size={16} type={selectedOption.type} />
            ) : (
              <LayersIcon size={16} />
            )}
          </span>
          <span className="app-type-dropdown-copy">
            <span className="app-type-dropdown-value">{triggerLabel}</span>
          </span>
        </span>
        <span aria-hidden="true" className={isOpen ? "app-type-dropdown-icon is-open" : "app-type-dropdown-icon"}>
          <AppTypeDropdownChevronIcon />
        </span>
      </button>

      {isOpen && menuStyle ? (
        <div
          ref={menuRef}
          aria-label={ariaLabel}
          className="app-type-dropdown-menu"
          id={listboxId}
          role="listbox"
          style={menuStyle}
        >
          {options.map((option, optionIndex) => {
            const isSelected = option.value === selectedOption?.value;
            const isHighlighted = optionIndex === highlightedIndex;

            return (
              <button
                aria-selected={isSelected}
                className={[
                  "app-type-dropdown-option",
                  isSelected ? "is-selected" : "",
                  isHighlighted ? "is-highlighted" : ""
                ].filter(Boolean).join(" ")}
                key={option.value}
                onClick={() => selectOption(option.value)}
                onFocus={() => setHighlightedIndex(optionIndex)}
                onKeyDown={(event) => handleOptionKeyDown(event, optionIndex)}
                onMouseEnter={() => setHighlightedIndex(optionIndex)}
                ref={(node) => {
                  optionRefs.current[optionIndex] = node;
                }}
                role="option"
                tabIndex={isHighlighted ? 0 : -1}
                type="button"
              >
                <span className="app-type-dropdown-option-main">
                  <span aria-hidden="true" className="app-type-inline-icon">
                    <AppTypeIcon isUnified={option.isUnified} size={16} type={option.type} />
                  </span>
                  <span className="app-type-dropdown-option-copy">
                    <span>{option.label}</span>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                </span>
                {isSelected ? <strong>Current</strong> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function AppTypeDropdownChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
