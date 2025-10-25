"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildShareMessage } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CourtLite = { _id: string; name: string; address?: string; status?: string };

type Level = "Beginner" | "Medium" | "Hard";

export default function CreateMatchPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(""); // yyyy-mm-dd
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState("120"); // minutes; default 2 hours
  const [place, setPlace] = useState("");
  const [courtId, setCourtId] = useState<string | "">("");
  const [level, setLevel] = useState<Level>("Medium");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState("public"); // "public" | "private"
  const [courts, setCourts] = useState<CourtLite[]>([]);
  const [loadingCourts, setLoadingCourts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  const timeOptions = useMemo(() => {
    // 07:00..21:00 inclusive by hours => 15 values
    const values: string[] = [];
    for (let h = 7; h <= 21; h++) {
      const hh = String(h).padStart(2, "0");
      values.push(`${hh}:00`);
    }
    return values;
  }, []);

  useEffect(() => {
    // default date = today (yyyy-mm-dd)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    setDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCourts() {
      setLoadingCourts(true);
      setError(null);
      try {
        // Prefer all courts (admin). If 403, fallback to mine for court_admin.
        let res = await authFetchWithRetry("/api/admin/courts?limit=100");
        if (res.status === 403) {
          res = await authFetchWithRetry("/api/admin/courts/mine?limit=100");
        }
        if (!res.ok) throw new Error(`Failed to load courts: ${res.status}`);
        const data = await res.json();
        const list: CourtLite[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.courts)
            ? data.courts
            : [];
        if (!cancelled) setCourts(list.filter(c => c && c.status !== "inactive"));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load locations");
      } finally {
        if (!cancelled) setLoadingCourts(false);
      }
    }
    loadCourts();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!title.trim()) throw new Error("Title required");
      if (!date) throw new Error("Date required");
      if (!startTime) throw new Error("Start time required");
      const [h, m] = startTime.split(":").map(Number);
      const localDate = parseLocalYmd(date);
      if (!localDate) throw new Error("Invalid date");
      localDate.setHours(h, m ?? 0, 0, 0);
      const startDateTime = localDate.toISOString();

      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description?.trim() || "",
        startDateTime,
        duration: Number(duration),
        level,
        isPrivate: isPrivate === "private",
      };
      if (courtId) body.courtId = courtId;
      else if (place.trim()) body.place = place.trim();

      const res = await authFetchWithRetry("/api/matches", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err?.message || `Create failed: ${res.status}`);
      }
      const created = await res.json();
      // Prepare share data and open modal
      // Enrich participants with current user's rating (creator)
      const baseParticipants = Array.isArray(created.participants) ? created.participants : [];
      const participantsForShare = baseParticipants.map((p: any) => {
        if (!p) return p;
        if (user && (p._id === (user._id || (user as any).id) || p.email === user.email)) {
          return { ...p, rating: typeof user.rating === "number" ? user.rating : p.rating };
        }
        return p;
      });

      const msg = buildShareMessage({
        title: created.title,
        place: created.place,
        isPrivate: !!created.isPrivate,
        level: created.level,
        startDateTime: created.startDateTime,
        duration: created.duration,
        participants: participantsForShare,
        creator: created.creator,
      });
      const url = `/match/${created._id}`;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const originNoWww = origin.replace("://www.", "://");
      setShareText(msg + "\n\n" + ((originNoWww ? originNoWww : "") + url));
      setShareUrl(url);
      setShareOpen(true);
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message || "Failed to create match");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Create match</h1>
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">Match title</Label>
          <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Morning beach run" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <div className="min-w-0"><DatePicker
              value={date ? parseLocalYmd(date) : null}
              onChange={(d) => setDate(d ? formatLocalYmd(d) : "")}
            /></div>
          </div>
          <div className="space-y-2">
            <Label>Start time</Label>
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select start" />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Place</Label>
            <Select value={courtId || "_custom"} onValueChange={(v) => { if (v === "_custom") { setCourtId(""); } else { setCourtId(v); setPlace(""); } }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loadingCourts ? "Loading..." : "Choose court (optional)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_custom">Custom place</SelectItem>
                {courts.map(c => (
                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="place">Custom place</Label>
            <Input id="place" value={place} onChange={e => setPlace(e.target.value)} placeholder="Beach address or name" disabled={!!courtId} className={courtId ? "opacity-60" : undefined} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Beginner">Beginner</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Match type</Label>
            <Select value={isPrivate} onValueChange={setIsPrivate}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="desc">Description</Label>
          <Textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Notes, special rules, etc." />
        </div>

        <div className="min-h-[20px] text-sm text-red-600">{error}</div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create"}</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share match</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap break-all font-mono">
            {shareText}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (navigator?.clipboard) navigator.clipboard.writeText(shareText);
              }}
            >Copy</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShareOpen(false);
                router.push(shareUrl);
              }}
            >Open match</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null as unknown; }
}


function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalYmd(ymd: string): Date | null {
  if (!ymd) return null;
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y, (m - 1), d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}


