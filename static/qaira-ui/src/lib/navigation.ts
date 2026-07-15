import { requiredPermissionsForPath, type PageAccessMap } from "./permissions";

export type NavigationRouteItem = {
  label: string;
  matchPaths?: readonly string[];
  shortLabel?: string;
  to: string;
};

export function isNavigationItemActive(item: Pick<NavigationRouteItem, "matchPaths" | "to">, pathname: string) {
  if (item.to === "/") {
    return pathname === "/";
  }

  if (pathname === item.to) {
    return true;
  }

  return Boolean(item.matchPaths?.includes(pathname));
}

export function getNavigationItemLabel(item: Pick<NavigationRouteItem, "label" | "shortLabel">, shouldUseShortLabel: boolean) {
  return shouldUseShortLabel ? item.shortLabel || item.label : item.label;
}

export function getNavigationItemPermissions(item: Pick<NavigationRouteItem, "matchPaths" | "to">, pageAccess?: PageAccessMap | null) {
  return [item.to, ...(item.matchPaths || [])].flatMap((path) => requiredPermissionsForPath(path, pageAccess));
}
