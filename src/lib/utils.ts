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
  const names = (m.participants || [])
    .map((p: any) => (typeof p === "string" ? p : p?.name))
    .filter(Boolean);
  if (names.length) lines.push(`✅ ${names[0]}`);
  const empty = Math.max(0, 6 - names.length);
  for (let i = 0; i < empty; i++) lines.push("⚪ ??");
  return lines.join("\n");
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
