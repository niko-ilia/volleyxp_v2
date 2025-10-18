"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

type ProfileResponse = {
  id: string;
  name: string;
  email: string;
  rating?: number;
  createdAt?: string;
};

export default function ProfilePage() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = React.useState<ProfileResponse | null>(null);
  const [name, setName] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [matches, setMatches] = React.useState<any[] | null>(null);
  const [statsSummary, setStatsSummary] = React.useState<{ total: number; wins: number; losses: number; winPct: number } | null>(null);
  const [matchesError, setMatchesError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 5;
  const [statsByMatchId, setStatsByMatchId] = React.useState<Record<string, { wins: number; losses: number }>>({});
  // Dedupe in-flight/attempted stats fetches to avoid network spam on re-renders
  const requestedStatsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authFetchWithRetry("/api/users/profile");
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }
        const data: ProfileResponse = await res.json();
        if (!cancelled) {
          setProfile(data);
          setName(data.name || "");
          setLoaded(true);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load profile");
          setLoaded(true);
        }
      }
    }
    if (user) load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadMatches() {
      setMatchesError(null);
      try {
        const res = await authFetchWithRetry(`/api/matches`);
        if (!res.ok) throw new Error(`Failed to load matches: ${res.status}`);
        const all = await res.json();
        // Keep only matches where current user is a participant or creator
        const uid = (user && (user._id || (user as any).id)) || null;
        const my = Array.isArray(all)
          ? all.filter((m: any) => {
              const creatorId = m?.creator?._id || m?.creator;
              const partIds: string[] = Array.isArray(m?.participants)
                ? m.participants.map((p: any) => p?._id || p).filter(Boolean)
                : [];
              return uid && (creatorId === uid || partIds.includes(uid));
            })
          : [];
        // Sort by date (newest first)
        my.sort((a: any, b: any) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime());
         if (!cancelled) {
          setMatches(my);
          setPage(1);
        }
      } catch (e: any) {
        if (!cancelled) setMatchesError(e?.message || "Failed to load matches");
      }
    }
    if (user) loadMatches();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Load result stats for visible page matches
  React.useEffect(() => {
    if (!matches || !user) return;
    const uid = (user && (user._id || (user as any).id)) || null;
    let cancelled = false;
    const list = matches as any[]; // snapshot non-null value for TS
    async function loadStatsForPage() {
      const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      await Promise.all(slice.map(async (m) => {
        // Запрашиваем статистику только для завершённых матчей,
        // иначе бэкенд корректно возвращает 404 и засоряет консоль
        if (!m?._id || m?.status !== 'finished' || statsByMatchId[m._id]) return;
        if (requestedStatsRef.current.has(m._id)) return; // уже запрашивали
        requestedStatsRef.current.add(m._id);
        try {
          const res = await authFetchWithRetry(`/api/results/${m._id}/stats`);
          if (!res.ok) return; // no result yet or error — skip silently
          const data = await res.json();
          const me = Array.isArray(data?.item?.participants)
            ? data.item.participants.find((p: any) => (p.userId?._id || p.userId) === uid)
            : null;
          const next = { wins: me?.wins ?? 0, losses: me?.losses ?? 0 };
          if (!cancelled) setStatsByMatchId((prev) => ({ ...prev, [m._id]: next }));
        } catch {}
      }));
    }
    loadStatsForPage();
    return () => { cancelled = true; };
  }, [matches, page, PAGE_SIZE, user, statsByMatchId]);

  // Compute full summary across all finished matches
  React.useEffect(() => {
    if (!matches || !user) return;
    let cancelled = false;
    const uid = (user && (user._id || (user as any).id)) || null;
    const list = matches as any[]; // capture non-null value for TS
    async function computeSummary() {
      const finished = list.filter((m: any) => m?.status === 'finished');
      let wins = 0; let losses = 0; const total = finished.length;
      // Fetch stats for those we don't have yet and aggregate
      for (const m of finished) {
        if (!m?._id) continue;
        if (statsByMatchId[m._id]) {
          const small = statsByMatchId[m._id];
          if ((small.wins ?? 0) > (small.losses ?? 0)) wins += 1; else if ((small.losses ?? 0) > (small.wins ?? 0)) losses += 1;
          continue;
        }
        if (requestedStatsRef.current.has(m._id)) continue;
        requestedStatsRef.current.add(m._id);
        try {
          const res = await authFetchWithRetry(`/api/results/${m._id}/stats`);
          if (!res.ok) continue;
          const data = await res.json();
          const me = Array.isArray(data?.item?.participants)
            ? data.item.participants.find((p: any) => (p.userId?._id || p.userId) === uid)
            : null;
          if (me) {
            if ((me.wins ?? 0) > (me.losses ?? 0)) wins += 1;
            else if ((me.losses ?? 0) > (me.wins ?? 0)) losses += 1;
          }
          const small = { wins: me?.wins ?? 0, losses: me?.losses ?? 0 };
          setStatsByMatchId(prev => ({ ...prev, [m._id]: prev[m._id] || small }));
        } catch {}
      }
      if (!cancelled) {
        setStatsSummary({ total, wins, losses, winPct: total ? wins / total : 0 });
      }
    }
    computeSummary();
    return () => { cancelled = true; };
  }, [matches, user]);

  const onSave = React.useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetchWithRetry("/api/users/profile", {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to save");
      }
      const updated = await res.json();
      setProfile((p) => (p ? { ...p, name: updated.name } : updated));
      await refreshUser();
    } catch (e: any) {
      setError(e?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }, [name, refreshUser]);

  const createdAtFmt = React.useMemo(() => {
    if (!profile?.createdAt) return "—";
    try {
      const d = new Date(profile.createdAt);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("en-US");
    } catch {
      return "—";
    }
  }, [profile?.createdAt]);

  if (loading || (!loaded && user)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
              <div className="h-9 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-9 w-24 animate-pulse rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {error ? (
              <div className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter name" />
                <Button disabled={saving || name.trim() === (profile?.name || "")} onClick={onSave}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Email</div>
              <div className="text-sm text-muted-foreground">{profile?.email || "—"}</div>
            </div>

            <div className="space-y-1">
              <div className="text-sm font-medium">Registration date</div>
              <div className="text-sm text-muted-foreground">{createdAtFmt}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary stats */}
      <div className="mt-8 max-w-xl mx-auto">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Statistics</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href="/profile/stats" className="inline-flex items-center gap-1">
                Detailed stats <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Matches</div>
                <div className="text-xl font-semibold">{statsSummary?.total ?? 0}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Win %</div>
                <div className="text-xl font-semibold">{statsSummary ? Math.round(statsSummary.winPct * 100) : 0}%</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Wins</div>
                <div className="text-xl font-semibold">{statsSummary?.wins ?? 0}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Losses</div>
                <div className="text-xl font-semibold">{statsSummary?.losses ?? 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>My matches</CardTitle>
          </CardHeader>
          <CardContent>
            {matchesError ? (
              <div className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {matchesError}
              </div>
            ) : null}

            {!matches ? (
              <div className="space-y-2">
                <div className="h-9 w-full animate-pulse rounded bg-muted" />
                <div className="h-9 w-full animate-pulse rounded bg-muted" />
                <div className="h-9 w-full animate-pulse rounded bg-muted" />
              </div>
            ) : matches.length === 0 ? (
              <div className="text-sm text-muted-foreground">No matches yet</div>
            ) : (
              <div className="space-y-3">
                {(matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)).map((m) => {
                  const dt = new Date(m.startDateTime);
                  const dateStr = dt.toLocaleDateString("en-US");
                  const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const stat = statsByMatchId[m._id] || { wins: undefined as any, losses: undefined as any };
                  return (
                    <Link key={m._id} href={`/match/${m._id}`} className="block">
                      <div className="flex items-center justify-between rounded border p-3 hover:bg-muted/50">
                        <div>
                          <div className="font-medium">{m.place || m.title}</div>
                          <div className="text-xs text-muted-foreground">{dateStr} • {timeStr} • {m.level}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {typeof stat.wins === 'number' || typeof stat.losses === 'number' ? (
                            <>
                              <Badge>W {stat.wins ?? 0}</Badge>
                              <Badge variant="secondary">L {stat.losses ?? 0}</Badge>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  );
                })}

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Back</Button>
                  <div className="text-xs text-muted-foreground">
                    Page {page} of {Math.max(1, Math.ceil(matches.length / PAGE_SIZE))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(matches.length / PAGE_SIZE)}
                    onClick={() => setPage((p) => Math.min(Math.ceil(matches.length / PAGE_SIZE), p + 1))}
                  >Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


