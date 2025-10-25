import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type ShareBuildInput = {
  title: string;
  place: string;
  isPrivate: boolean;
  level: string;
  startDateTime: string;
  duration: number;
  participants: any[];
  creator?: any;
};

export function buildShareMessage(m: ShareBuildInput) {
  const dt = new Date(m.startDateTime);
  const weekday = dt.toLocaleDateString(undefined, { weekday: "long" });
  const day = dt.getDate();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const durStr = m.duration === 60 ? "1 hour" : `${Math.round(m.duration / 60)} hours`;
  const header = `**${m.title || "MATCH"} IN THE ${m.place?.toUpperCase?.() || "PLACE"}**`;
  const lines: string[] = [];
  lines.push(header);
  lines.push("\n");
  lines.push(`📅 ${capitalize(weekday)} ${day}, ${hh}:${mm} (${durStr})`);
  lines.push(`📍 ${m.place}`);
  lines.push(`${m.isPrivate ? "🔒 Private" : "🌐 Public"}`);
  lines.push(`🎯 Player Level: ${m.level}`);
  // Build a de-duplicated map of displayName -> rating (if present)
  const nameToRating = new Map<string, number | undefined>();
  for (const p of (m.participants || [])) {
    const label = typeof p === "string" ? p : (p?.name || p?.email);
    if (!label) continue;
    if (!nameToRating.has(label)) {
      const r: unknown = typeof p === "object" && p ? (p as any).rating : undefined;
      nameToRating.set(label, typeof r === "number" && Number.isFinite(r) ? r : undefined);
    }
  }
  // List all current players, one per line, append rating if available
  for (const [label, r] of nameToRating.entries()) {
    const suffix = typeof r === "number" ? ` (${r.toFixed(2)})` : "";
    lines.push(`✅ ${label}${suffix}`);
  }
  // Pad up to 6
  const empty = Math.max(0, 6 - nameToRating.size);
  for (let i = 0; i < empty; i++) lines.push("⚪ ??");
  return lines.join("\n");
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
