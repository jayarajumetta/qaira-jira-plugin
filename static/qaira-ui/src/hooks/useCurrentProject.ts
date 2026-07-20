import { useCallback, useEffect, useState } from "react";
import { readCurrentProjectId, writeCurrentProjectId as persistCurrentProjectId } from "../lib/currentScope";

const CURRENT_PROJECT_STORAGE_KEY = "qaira.current_project_id";
const LEGACY_CURRENT_PROJECT_STORAGE_KEY = "sidebar_project_id";
const CURRENT_PROJECT_EVENT = "qaira:current-project-change";
const CURRENT_APP_TYPE_STORAGE_KEY = "qaira.current_app_type_by_project";
const LEGACY_CURRENT_APP_TYPE_STORAGE_KEY = "sidebar_app_type_id";
const CURRENT_APP_TYPE_EVENT = "qaira:current-app-type-change";
const CURRENT_SCOPE_STATE_VERSION_KEY = "qaira_scope_state_version";
const CURRENT_SCOPE_STATE_VERSION = "3";

type AppTypeChangeDetail = {
  projectId: string;
  appTypeId: string;
};

type AppTypeScopeState = {
  projectId: string;
  appTypeId: string;
};

const dispatchScopedEvent = (eventName: string, detail: Record<string, string>) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(eventName, { detail }));
};

const migrateScopeState = () => {
  if (typeof window === "undefined") {
    return;
  }

  const storedProjectId = window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY);
  const legacyProjectId = window.localStorage.getItem(LEGACY_CURRENT_PROJECT_STORAGE_KEY);
  if (!storedProjectId && legacyProjectId) {
    window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, legacyProjectId);
  }

  const storedAppTypeMap = window.localStorage.getItem(CURRENT_APP_TYPE_STORAGE_KEY);
  const legacyAppTypeMap = window.localStorage.getItem(LEGACY_CURRENT_APP_TYPE_STORAGE_KEY);
  if (!storedAppTypeMap && legacyAppTypeMap) {
    window.localStorage.setItem(CURRENT_APP_TYPE_STORAGE_KEY, legacyAppTypeMap);
  }

  window.localStorage.removeItem(LEGACY_CURRENT_PROJECT_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_CURRENT_APP_TYPE_STORAGE_KEY);

  if (window.localStorage.getItem(CURRENT_SCOPE_STATE_VERSION_KEY) === CURRENT_SCOPE_STATE_VERSION) {
    return;
  }

  window.localStorage.setItem(CURRENT_SCOPE_STATE_VERSION_KEY, CURRENT_SCOPE_STATE_VERSION);
};

const writeCurrentProjectId = (projectId: string | number) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedId = projectId != null ? String(projectId) : "";

  persistCurrentProjectId(normalizedId);
  window.dispatchEvent(new CustomEvent(CURRENT_PROJECT_EVENT, { detail: { projectId: normalizedId } }));
};

export function useCurrentProject() {
  const [projectId, setProjectIdState] = useState(readCurrentProjectId);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncProjectId = () => {
      setProjectIdState(readCurrentProjectId());
    };

    migrateScopeState();
    syncProjectId();

    window.addEventListener("storage", syncProjectId);
    window.addEventListener(CURRENT_PROJECT_EVENT, syncProjectId);

    return () => {
      window.removeEventListener("storage", syncProjectId);
      window.removeEventListener(CURRENT_PROJECT_EVENT, syncProjectId);
    };
  }, []);

  const setProjectId = useCallback((nextProjectId: string | number) => {
    const normalizedId = nextProjectId != null ? String(nextProjectId) : "";
    setProjectIdState(normalizedId);
    writeCurrentProjectId(normalizedId);
  }, []);

  return [projectId, setProjectId] as const;
}

const readStoredAppTypeMap = () => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(CURRENT_APP_TYPE_STORAGE_KEY) || window.localStorage.getItem(LEGACY_CURRENT_APP_TYPE_STORAGE_KEY) || "{}";
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
};

const readCurrentAppTypeId = (projectId: string) => {
  if (!projectId) {
    return "";
  }

  return readStoredAppTypeMap()[projectId] || "";
};

const writeCurrentAppTypeId = (projectId: string, appTypeId: string) => {
  if (typeof window === "undefined" || !projectId) {
    return;
  }

  const next = readStoredAppTypeMap();

  if (appTypeId) {
    next[projectId] = appTypeId;
  } else {
    delete next[projectId];
  }

  window.localStorage.setItem(CURRENT_APP_TYPE_STORAGE_KEY, JSON.stringify(next));
  window.localStorage.removeItem(LEGACY_CURRENT_APP_TYPE_STORAGE_KEY);
  dispatchScopedEvent(CURRENT_APP_TYPE_EVENT, { projectId, appTypeId });
};

export const setCurrentScope = (projectId: string | number, appTypeId = "") => {
  const normalizedProjectId = projectId == null ? "" : String(projectId);
  if (!normalizedProjectId) {
    writeCurrentProjectId("");
    return;
  }

  // Persist the child scope first so every project-change listener observes a
  // coherent project/app-space pair on its first render.
  if (appTypeId) writeCurrentAppTypeId(normalizedProjectId, appTypeId);
  writeCurrentProjectId(normalizedProjectId);
};

export function useCurrentAppType(projectId: string) {
  const [scopeState, setScopeState] = useState<AppTypeScopeState>(() => ({
    projectId,
    appTypeId: readCurrentAppTypeId(projectId)
  }));

  const appTypeId = scopeState.projectId === projectId ? scopeState.appTypeId : readCurrentAppTypeId(projectId);

  useEffect(() => {
    setScopeState({
      projectId,
      appTypeId: readCurrentAppTypeId(projectId)
    });
  }, [projectId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncAppTypeId = (event?: Event) => {
      if (event instanceof CustomEvent && typeof (event.detail as Partial<AppTypeChangeDetail>)?.projectId === "string" && event.detail.projectId !== projectId) {
        return;
      }

      setScopeState({
        projectId,
        appTypeId: readCurrentAppTypeId(projectId)
      });
    };

    window.addEventListener("storage", syncAppTypeId);
    window.addEventListener(CURRENT_APP_TYPE_EVENT, syncAppTypeId);

    return () => {
      window.removeEventListener("storage", syncAppTypeId);
      window.removeEventListener(CURRENT_APP_TYPE_EVENT, syncAppTypeId);
    };
  }, [projectId]);

  const setAppTypeId = useCallback((nextAppTypeId: string) => {
    setScopeState({
      projectId,
      appTypeId: nextAppTypeId
    });
    writeCurrentAppTypeId(projectId, nextAppTypeId);
  }, [projectId]);

  return [appTypeId, setAppTypeId] as const;
}
