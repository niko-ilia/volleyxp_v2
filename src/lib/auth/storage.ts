export type AuthUser = {
  _id?: string;
  id?: string;
  email: string;
  name: string;
  rating?: number;
  isEmailConfirmed?: boolean;
};

const TOKEN_KEY = "volley_token";
const REFRESH_KEY = "volley_refresh_token";
const USER_KEY = "volley_user";

export function saveAuth(token: string, refreshToken: string | null, user: AuthUser) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}



