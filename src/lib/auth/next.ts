const NEXT_KEY = "volley_next";

export function sanitizeNextPath(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    const s = String(path).trim();
    if (!s) return null;
    // Only allow same-origin absolute paths like "/match/123?x=y"; reject protocol-relative and external URLs
    if (s.startsWith("/")) {
      if (s.startsWith("//")) return null;
      return s;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveNextPath(path: string) {
  try {
    const safe = sanitizeNextPath(path);
    if (safe) localStorage.setItem(NEXT_KEY, safe);
  } catch {}
}

export function getSavedNextPath(): string | null {
  try {
    const v = localStorage.getItem(NEXT_KEY);
    return sanitizeNextPath(v);
  } catch {
    return null;
  }
}

export function consumeSavedNextPath(): string | null {
  try {
    const v = getSavedNextPath();
    localStorage.removeItem(NEXT_KEY);
    return v;
  } catch {
    return null;
  }
}


