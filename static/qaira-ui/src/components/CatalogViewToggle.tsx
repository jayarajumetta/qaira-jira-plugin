import { useEffect, useRef, useState } from "react";
import { useLocalization } from "../context/LocalizationContext";
import { isMobileGridOnlyViewport, MOBILE_GRID_ONLY_QUERY } from "../lib/viewPreferences";
import { GridIcon, ListIcon } from "./AppIcons";

export function CatalogViewToggle({
  value,
  onChange
}: {
  value: "tile" | "list";
  onChange: (nextValue: "tile" | "list") => void;
}) {
  const { t } = useLocalization();
  const [isMobileGridOnly, setIsMobileGridOnly] = useState(() => isMobileGridOnlyViewport());
  const lastNonMobileValueRef = useRef<"tile" | "list">(value);
  const forcedMobileTileRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = window.matchMedia(MOBILE_GRID_ONLY_QUERY);
    const syncMobileMode = () => setIsMobileGridOnly(query.matches);

    syncMobileMode();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", syncMobileMode);
    } else {
      query.addListener(syncMobileMode);
    }

    return () => {
      if (typeof query.removeEventListener === "function") {
        query.removeEventListener("change", syncMobileMode);
      } else {
        query.removeListener(syncMobileMode);
      }
    };
  }, []);

  useEffect(() => {
    if (isMobileGridOnly) {
      if (value !== "tile") {
        lastNonMobileValueRef.current = value;
        forcedMobileTileRef.current = true;
        onChange("tile");
      }
      return;
    }

    if (forcedMobileTileRef.current) {
      forcedMobileTileRef.current = false;
      if (value !== lastNonMobileValueRef.current) {
        onChange(lastNonMobileValueRef.current);
      }
      return;
    }

    if (!isMobileGridOnly) {
      lastNonMobileValueRef.current = value;
    }
  }, [isMobileGridOnly, onChange, value]);

  return (
    <div aria-label="Catalog view mode" className="catalog-view-toggle" data-mobile-grid-only={isMobileGridOnly ? "true" : undefined} role="group">
      <button
        aria-label={t("catalog.view.tile", "Tile view")}
        className={value === "tile" ? "catalog-view-button is-active" : "catalog-view-button"}
        onClick={() => onChange("tile")}
        title={t("catalog.view.tile", "Tile view")}
        type="button"
      >
        <GridIcon size={15} />
      </button>
      <button
        aria-label={t("catalog.view.list", "List view")}
        className={value === "list" ? "catalog-view-button is-active" : "catalog-view-button"}
        onClick={() => onChange("list")}
        title={t("catalog.view.list", "List view")}
        type="button"
      >
        <ListIcon size={15} />
      </button>
    </div>
  );
}
