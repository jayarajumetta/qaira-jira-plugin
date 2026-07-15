const CURRENT_PROJECT_STORAGE_KEY = "qaira.current_project_id";
const LEGACY_CURRENT_PROJECT_STORAGE_KEY = "sidebar_project_id";

const UNSCOPED_API_PATHS = [
  "/auth/",
  "/projects",
  "/metadata/domain"
] as const;

const UNSCOPED_QUERY_ROOTS = new Set(["projects", "domain-metadata"]);

export function readCurrentProjectId() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY)
    || window.localStorage.getItem(LEGACY_CURRENT_PROJECT_STORAGE_KEY)
    || "";
}

export function writeCurrentProjectId(projectId: string | number) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedId = projectId != null ? String(projectId) : "";
  if (normalizedId) {
    window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, normalizedId);
  } else {
    window.localStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
  }
  window.localStorage.removeItem(LEGACY_CURRENT_PROJECT_STORAGE_KEY);
}

export function isProjectScopedApiPath(path: string) {
  const pathname = path.split("?")[0] || "/";
  return !UNSCOPED_API_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function appendCurrentProjectScope(path: string) {
  const projectId = readCurrentProjectId();
  if (!projectId || !isProjectScopedApiPath(path)) {
    return path;
  }

  const url = new URL(path, "https://qaira.local");
  if (!url.searchParams.has("project_id") && !url.searchParams.has("projectKey")) {
    url.searchParams.set("project_id", projectId);
  }
  return `${url.pathname}${url.search}`;
}

export function projectAwareQueryKey(queryKey: readonly unknown[]) {
  const root = String(queryKey[0] || "");
  if (UNSCOPED_QUERY_ROOTS.has(root)) {
    return ["qaira-global", queryKey] as const;
  }
  return ["qaira-project", readCurrentProjectId() || "unselected", queryKey] as const;
}
