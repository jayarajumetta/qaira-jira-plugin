import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import {
  DEFAULT_LOCALIZATION_STRINGS,
  LOCALIZATION_STORAGE_KEY,
  mergeLocalizationStrings,
  type LocalizationStrings
} from "../lib/localization";

type LocalizationContextValue = {
  strings: LocalizationStrings;
  t: (key: string, fallback?: string) => string;
  setWorkspaceStrings: (nextStrings: LocalizationStrings) => void;
};

const LocalizationContext = createContext<LocalizationContextValue>({
  strings: DEFAULT_LOCALIZATION_STRINGS,
  t: (_key, fallback = "") => fallback,
  setWorkspaceStrings: () => undefined
});

const readCachedStrings = () => {
  try {
    const raw = window.localStorage.getItem(LOCALIZATION_STORAGE_KEY);
    return raw ? mergeLocalizationStrings(JSON.parse(raw) as LocalizationStrings) : DEFAULT_LOCALIZATION_STRINGS;
  } catch {
    return DEFAULT_LOCALIZATION_STRINGS;
  }
};

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [strings, setStrings] = useState<LocalizationStrings>(() => readCachedStrings());

  useEffect(() => {
    if (!session) {
      setStrings(readCachedStrings());
      return;
    }

    let isCancelled = false;

    void api.settings.getLocalization()
      .then((response) => {
        if (isCancelled) {
          return;
        }

        const nextStrings = mergeLocalizationStrings(response.strings);
        setStrings(nextStrings);
        window.localStorage.setItem(LOCALIZATION_STORAGE_KEY, JSON.stringify(nextStrings));
      })
      .catch(() => {
        if (!isCancelled) {
          setStrings(readCachedStrings());
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [session]);

  const value = useMemo<LocalizationContextValue>(() => ({
    strings,
    t: (key, fallback) => strings[key] || fallback || key,
    setWorkspaceStrings: (nextStrings) => {
      const merged = mergeLocalizationStrings(nextStrings);
      setStrings(merged);
      window.localStorage.setItem(LOCALIZATION_STORAGE_KEY, JSON.stringify(merged));
    }
  }), [strings]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  return useContext(LocalizationContext);
}
