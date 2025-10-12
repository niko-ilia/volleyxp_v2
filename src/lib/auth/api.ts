import { getToken, getRefreshToken, saveAuth, clearAuth } from "./storage";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""; // e.g., '' assumes same origin

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



