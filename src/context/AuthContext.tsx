"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AuthUser, clearAuth, getToken, getUser, saveAuth } from "@/lib/auth/storage";
import { apiFetch, authFetch, refreshTokenOnce } from "@/lib/auth/api";
import { useRouter } from "next/navigation";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  loginWithPassword: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const t = getToken();
      const u = getUser();
      setToken(t);
      setUser(u);
    } finally {
      setLoading(false);
    }
  }, []);

  // Dedup concurrent refreshUser calls within a small window
  const refreshInFlightRef = (globalThis as any).__volleyRefreshInFlightRef || { p: null as Promise<void> | null, ts: 0 };
  (globalThis as any).__volleyRefreshInFlightRef = refreshInFlightRef;
  const REFRESH_DEDUP_MS = 3000;
  const refreshUser = useCallback(async () => {
    const now = Date.now();
    if (refreshInFlightRef.p && now - refreshInFlightRef.ts < REFRESH_DEDUP_MS) {
      return refreshInFlightRef.p;
    }
    const job = (async () => {
      const res = await authFetch("/api/auth/me");
    if (res.status === 401) {
      const ref = await refreshTokenOnce();
      if (!ref) {
        clearAuth();
        setUser(null);
        setToken(null);
          return;
      }
      const retry = await authFetch("/api/auth/me");
      if (!retry.ok) return;
      const me = await retry.json();
      setUser(me);
    } else if (res.ok) {
      const me = await res.json();
      setUser(me);
    }
    })().finally(() => { refreshInFlightRef.p = null; });
    refreshInFlightRef.p = job; refreshInFlightRef.ts = now; return job;
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const res = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    if (!res.ok) return false;
    const data = await res.json();
    saveAuth(data.token, data.refreshToken ?? null, data.user);
    setToken(data.token);
    setUser(data.user);
    router.push("/");
    return true;
  }, [router]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
    if (!res.ok) return false;
    const data = await res.json();
    saveAuth(data.token, data.refreshToken ?? null, data.user);
    setToken(data.token);
    setUser(data.user);
    router.push("/");
    return true;
  }, [router]);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    setToken(null);
    router.push("/login");
  }, [router]);

  const value = useMemo(() => ({ user, token, loading, loginWithPassword, register, logout, refreshUser }), [user, token, loading, loginWithPassword, register, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}



