import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { areFeatureFlagsEnabled } from "../lib/featureFlags";
import { hasAnyPermission, hasPermission } from "../lib/permissions";
import { MoreIcon } from "./AppIcons";
import { InfoTooltip } from "./InfoTooltip";

export type CatalogActionMenuItem = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  description?: string;
  disabled?: boolean;
  featureKeys?: string[];
  permissionMode?: "all" | "any";
  requiredPermissions?: string[];
  tone?: "default" | "danger" | "primary";
};

export function CatalogActionMenu({
  label,
  actions,
  className = ""
}: {
  label: string;
  actions: CatalogActionMenuItem[];
  className?: string;
}) {
  const { session } = useAuth();
  const featureFlagsQuery = useFeatureFlags(Boolean(session));
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const menuWidth = Math.max(menuRef.current?.offsetWidth || 256, 256);
      const menuHeight = menuRef.current?.offsetHeight || 260;
      const viewportPadding = 8;
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding
      );
      const bottomTop = rect.bottom + viewportPadding;
      const top = bottomTop + menuHeight > window.innerHeight - viewportPadding
        ? Math.max(viewportPadding, rect.top - menuHeight - viewportPadding)
        : bottomTop;

      setMenuStyle({
        left,
        top,
        minWidth: "16rem",
        maxWidth: "min(calc(100vw - 1rem), 22rem)",
        maxHeight: `calc(100vh - ${viewportPadding * 2}px)`,
        opacity: 1
      });
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;

      if (target && menuRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    updateMenuPosition();
    const frameId = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

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

	  const visibleActions = actions.filter((action) => {
	    const permissions = action.requiredPermissions || [];
	    const features = action.featureKeys || [];
	    const hasRequiredPermissions = !permissions.length
	      || (action.permissionMode === "all"
	        ? permissions.every((permission) => hasPermission(session, permission))
	        : hasAnyPermission(session, permissions));

	    return hasRequiredPermissions
	      && areFeatureFlagsEnabled(featureFlagsQuery.data, features);
	  });

  const menu = isOpen ? (
    <div
      className="step-card-menu-panel catalog-action-menu-panel"
      ref={menuRef}
      role="menu"
      style={menuStyle || { opacity: 0, pointerEvents: "none" }}
    >
      {visibleActions.map((action) => (
        <button
          className={["step-card-menu-item", action.tone ? `is-${action.tone}` : ""].filter(Boolean).join(" ")}
          disabled={action.disabled}
          key={action.label}
          onClick={(event) => {
            event.stopPropagation();
            action.onClick();
            setIsOpen(false);
          }}
          role="menuitem"
          title={action.label}
          type="button"
        >
          {action.icon}
          <span className="step-card-menu-item-content">
            <span className="step-card-menu-item-label-row">
              <span className="step-card-menu-item-label">{action.label}</span>
              {action.description ? (
                <InfoTooltip
                  content={action.description}
                  label={`${action.label} information`}
                  trigger="span"
                />
              ) : null}
            </span>
          </span>
        </button>
      ))}
      {!visibleActions.length ? <div className="step-card-menu-item is-empty">No actions available</div> : null}
    </div>
  ) : null;

  return (
    <div className={["step-card-menu", "step-card-menu--flat", "catalog-action-menu", className].filter(Boolean).join(" ")}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        className="step-card-menu-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        ref={triggerRef}
        title={label}
        type="button"
      >
        <MoreIcon />
      </button>
      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </div>
  );
}
