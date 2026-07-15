export type CatalogViewModePreference = "tile" | "list";

export const DEFAULT_CATALOG_VIEW_MODE_KEY = "qaira.default_catalog_view_mode";
export const MOBILE_GRID_ONLY_QUERY = "(max-width: 720px)";

export function isMobileGridOnlyViewport() {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_GRID_ONLY_QUERY).matches;
}

export function readDefaultCatalogViewMode(): CatalogViewModePreference {
  if (typeof window === "undefined") {
    return "tile";
  }

  if (isMobileGridOnlyViewport()) {
    return "tile";
  }

  return window.localStorage.getItem(DEFAULT_CATALOG_VIEW_MODE_KEY) === "list" ? "list" : "tile";
}

export function writeDefaultCatalogViewMode(value: CatalogViewModePreference) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DEFAULT_CATALOG_VIEW_MODE_KEY, value);
}
