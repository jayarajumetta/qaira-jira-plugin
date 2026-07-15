import type { Location } from "react-router-dom";

const CURRENT_WORKSPACE_ROUTE_KEY = "qaira.current_workspace_route";
const AUTH_REDIRECT_ROUTE_KEY = "qaira.auth_redirect_route";

export function getRouteFromLocation(location: Pick<Location, "pathname" | "search" | "hash">) {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function isRestorableWorkspaceRoute(route: string | null | undefined) {
  return Boolean(route && route.startsWith("/") && !route.startsWith("/auth"));
}

function readRoute(key: string) {
  try {
    const value = window.sessionStorage.getItem(key);
    return isRestorableWorkspaceRoute(value) ? value : "";
  } catch {
    return "";
  }
}

function writeRoute(key: string, route: string) {
  if (!isRestorableWorkspaceRoute(route)) {
    return;
  }

  try {
    window.sessionStorage.setItem(key, route);
  } catch {
    // Route continuity is a usability enhancement; storage failures should not block navigation.
  }
}

export function rememberCurrentWorkspaceRoute(route: string) {
  writeRoute(CURRENT_WORKSPACE_ROUTE_KEY, route);
}

export function readCurrentWorkspaceRoute() {
  return readRoute(CURRENT_WORKSPACE_ROUTE_KEY);
}

export function rememberAuthRedirectRoute(route: string) {
  writeRoute(AUTH_REDIRECT_ROUTE_KEY, route);
}

export function readAuthRedirectRoute() {
  return readRoute(AUTH_REDIRECT_ROUTE_KEY);
}

export function consumeAuthRedirectRoute() {
  const route = readRoute(AUTH_REDIRECT_ROUTE_KEY);

  try {
    window.sessionStorage.removeItem(AUTH_REDIRECT_ROUTE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }

  return route;
}

export function getPostAuthRoute() {
  return consumeAuthRedirectRoute() || readCurrentWorkspaceRoute() || "/";
}

export function readPostAuthRoute() {
  return readAuthRedirectRoute() || readCurrentWorkspaceRoute() || "/";
}

export function isBrowserReload() {
  const navigationEntry = window.performance
    ?.getEntriesByType?.("navigation")
    ?.find((entry): entry is PerformanceNavigationTiming => "type" in entry);

  if (navigationEntry?.type) {
    return navigationEntry.type === "reload";
  }

  const legacyNavigation = window.performance?.navigation;
  return Boolean(legacyNavigation && legacyNavigation.type === legacyNavigation.TYPE_RELOAD);
}
