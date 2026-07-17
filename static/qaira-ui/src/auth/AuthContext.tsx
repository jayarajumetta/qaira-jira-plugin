import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, qairaAuthSessionEvents, sessionStorage } from "../lib/api";
import type { SessionPayload } from "../types";

type AuthContextValue = {
  session: SessionPayload | null;
  isLoading: boolean;
  error: string | null;
  login: (input: { email: string; password: string }) => Promise<void>;
  loginWithGoogle: (input: { idToken: string }) => Promise<void>;
  requestSignupCode: (input: { email: string; password: string; name?: string }) => Promise<{ success: boolean; expiresAt?: string }>;
  verifySignupCode: (input: { email: string; code: string }) => Promise<void>;
  requestPasswordResetCode: (input: { email: string; newPassword: string }) => Promise<{ success: boolean; expiresAt?: string }>;
  verifyPasswordResetCode: (input: { email: string; code: string }) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = async () => {
    try {
      setIsLoading(true);
      const next = await api.auth.session();
      sessionStorage.write(next);
      setSession(next);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Jira session verification failed";
      setSession(null);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    const handleSessionRefresh = (event: Event) => {
      const next = (event as CustomEvent<SessionPayload>).detail;
      if (!next?.user) return;
      sessionStorage.write(next);
      setSession(next);
      setError(null);
    };

    window.addEventListener(qairaAuthSessionEvents.refresh, handleSessionRefresh);
    return () => window.removeEventListener(qairaAuthSessionEvents.refresh, handleSessionRefresh);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isLoading,
    error,
    async login() {
      await refreshSession();
    },
    async loginWithGoogle() {
      await refreshSession();
    },
    async requestSignupCode() {
      return { success: false };
    },
    async verifySignupCode() {
      await refreshSession();
    },
    async requestPasswordResetCode() {
      return { success: false };
    },
    async verifyPasswordResetCode() {
      await refreshSession();
    },
    logout() {
      sessionStorage.clear();
      setSession(null);
      setError("Qaira uses the active Atlassian session. Sign out from Jira to end the session.");
    },
    refreshSession,
    clearError() {
      setError(null);
    }
  }), [session, isLoading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
