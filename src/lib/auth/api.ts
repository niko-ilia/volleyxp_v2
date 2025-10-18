import { getToken, getRefreshToken, saveAuth, clearAuth } from "./storage";

function getEnvFallback(name: string): string | undefined {
  try {
    const v = (process.env as any)?.[name];
    if (v) return v as string;
  } catch {}
  try {
    const v = (globalThis as any)?.import?.meta?.env?.[name];
    if (v) return v as string;
  } catch {}
  try {
    if (typeof window !== "undefined") {
      const w = (window as any);
      return (w[name] || w[`__${name}__`]) as string | undefined;
    }
  } catch {}
  return undefined;
}

function normalizeBase(urlLike?: string): string {
  if (!urlLike) return "";
  let s = String(urlLike).trim();
  if (s.startsWith("@")) s = s.slice(1); // support Vite-style '@https://api...'
  // drop trailing slash for consistency
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

const RAW_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  getEnvFallback("VITE_API_NEW") ||
  ""; // empty => same-origin

const API_BASE = normalizeBase(RAW_BASE); // e.g., '' assumes same origin

export async function apiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(API_BASE + path, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
  return res;
}

export async function authFetch(path: string, init: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(API_BASE + path, {
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(init.headers || {}),
    },
    ...init,
  });
  return res;
}

export async function refreshTokenOnce() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const res = await apiFetch("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  saveAuth(data.token, data.refreshToken ?? null, data.user);
  return data;
}

export async function authFetchWithRetry(path: string, init: RequestInit = {}) {
  let res = await authFetch(path, init);
  if (res.status === 401) {
    const refreshed = await refreshTokenOnce();
    if (!refreshed) return res; // still 401
    res = await authFetch(path, init);
  }
  return res;
}



