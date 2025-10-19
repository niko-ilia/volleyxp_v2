"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buildShareMessage } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

type Match = {
  _id: string;
  title: string;
  place: string;
  level: string;
  isPrivate: boolean;
  startDateTime: string;
  duration: number;
  creator: { _id: string; name: string; email: string };
  participants: { _id: string; name: string; email: string; rating?: number }[];
  courtId?: { _id: string; name: string } | null;
  status?: string;
  joinSnapshots?: { userId: string; rating: number; joinedAt?: string }[];
};

type Result = {
  _id: string;
  match: string | Match;
  games?: any[];
  isConfirmed: boolean;
  confirmedBy?: { _id: string; name?: string; email?: string } | string;
  confirmedAt?: string;
};

function formatRating(r?: number): string {
  if (typeof r !== "number" || Number.isNaN(r)) return "—";
  return r.toFixed(2);
}

function maskEmail(email: string): string {
  const parts = String(email || "").split("@");
  if (parts.length !== 2) return String(email || "");
  const [local, domain] = parts;
  const localMasked = local.length <= 2
    ? (local.slice(0, 1) + "*")
    : (local.slice(0, 1) + "*".repeat(Math.min(local.length - 2, 3)) + local.slice(-1));
  const domainParts = domain.split(".");
  const name = domainParts.shift() || "";
  const domainMasked = (name ? name.slice(0, 1) + "***" : "***") + (domainParts.length ? "." + domainParts.join(".") : "");
  return `${localMasked}@${domainMasked}`;
}

export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id || "");
  const { user } = useAuth();

  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<Result | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [stats, setStats] = useState<null | { team1Wins: number; team2Wins: number; totalGames: number; participants: Array<{ userId: string; name?: string; email?: string; wins: number; losses: number; draws: number; games: number; ratingDelta?: number; newRating?: number; joinRating?: number; }> }>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const shareText = useMemo(() => {
    if (!match) return "";
    const msg = buildShareMessage({
      title: match.title,
      place: match.place,
      isPrivate: !!match.isPrivate,
      level: match.level,
      startDateTime: match.startDateTime,
      duration: match.duration,
      participants: match.participants,
      creator: match.creator,
    });
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const originNoWww = origin.replace("://www.", "://");
    const url = `${originNoWww}/match/${match._id}`;
    return msg + "\n\n" + url;
  }, [match]);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  type GameDraft = { team1: string[]; team2: string[]; team1Score: number | string; team2Score: number | string };
  const [gamesDraft, setGamesDraft] = useState<GameDraft[]>([{ team1: [], team2: [], team1Score: 0, team2Score: 0 }]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetchWithRetry(`/api/matches/${id}`);
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setMatch(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load match");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Load result draft/record for this match (if any)
  useEffect(() => {
    let cancelled = false;
    async function loadResult(matchId: string) {
      try {
        const res = await authFetchWithRetry(`/api/results/${matchId}`);
        if (cancelled) return;
        if (res.ok) {
          const r = await res.json();
          setResult(r);
          // prefill draft from existing
          const gd: GameDraft[] = Array.isArray(r?.games)
            ? r.games.map((g: any) => ({ team1: (g.team1 || []).map(String), team2: (g.team2 || []).map(String), team1Score: g.team1Score ?? 0, team2Score: g.team2Score ?? 0 }))
            : [{ team1: [], team2: [], team1Score: 0, team2Score: 0 }];
          setGamesDraft(gd.length ? gd : [{ team1: [], team2: [], team1Score: 0, team2Score: 0 }]);
        } else {
          // 404 means no result yet
          setResult(null);
          setGamesDraft([{ team1: [], team2: [], team1Score: 0, team2Score: 0 }]);
        }
      } catch {
        if (!cancelled) setResult(null);
      }
    }
    if (match?._id) loadResult(match._id);
    return () => { cancelled = true; };
  }, [match?._id]);

  // Load stats after confirmation
  useEffect(() => {
    let cancelled = false;
    async function loadStats(mid: string) {
      try {
        const res = await authFetchWithRetry(`/api/results/${mid}/stats`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const item = data?.item;
        if (item) {
          setStats({
            team1Wins: item.team1Wins ?? 0,
            team2Wins: item.team2Wins ?? 0,
            totalGames: item.totalGames ?? 0,
            participants: Array.isArray(item.participants) ? item.participants : [],
          });
        }
      } catch {}
    }
    if (match?._id && (result?.isConfirmed || match?.status === 'finished')) {
      loadStats(match._id);
    }
    return () => { cancelled = true; };
  }, [match?._id, result?.isConfirmed, match?.status]);

  async function leaveMatch() {
    if (!match) return;
    const res = await authFetchWithRetry(`/api/matches/${match._id}/leave`, { method: "POST" });
    if (res.ok) {
      const m = await res.json();
      setMatch(m);
    } else {
      const err = await safeJson(res);
      alert(err?.message || `Error ${res.status}`);
    }
  }

  async function doSearch(q: string) {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await authFetchWithRetry(`/api/users/search?q=${encodeURIComponent(q)}`);
      const data = res.ok ? await res.json() : [];
      const existingIds = new Set((match?.participants || []).map((p) => p._id));
      const existingEmails = new Set((match?.participants || []).map((p) => p.email));
      const list = Array.isArray(data) ? data : [];
      const filtered = list.filter((u: any) => !existingIds.has(u?._id) && !existingEmails.has(u?.email));
      setResults(filtered);
    } finally {
      setSearching(false);
    }
  }

  // Debounce search input to avoid request per keystroke
  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const id = setTimeout(() => { void doSearch(search); }, 300);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function addPlayer(email: string) {
    if (!match) return;
    setAdding(email);
    try {
      const res = await authFetchWithRetry(`/api/matches/${match._id}/add-player`, {
        method: "POST",
        body: JSON.stringify({ playerEmail: email }),
      });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err?.message || `Error ${res.status}`);
      }
      const updated = await res.json();
      setMatch(updated);
      setResults([]);
      setSearch("");
    } catch (e: any) {
      alert(e?.message || "Failed to add player");
    } finally {
      setAdding(null);
    }
  }

  async function cancelMatch() {
    if (!match) return;
    const start = new Date(match.startDateTime);
    const end = new Date(start.getTime() + match.duration * 60000);
    const now = new Date();
    const hasResult = !!result;
    const canCancelBeforeStart = now < start && !hasResult;
    const canDelete = now < start && hasResult; // unlikely, but keep semantics
    const canCancelAfterEnd = now > end && !hasResult && (now.getTime() - end.getTime() <= 48 * 60 * 60 * 1000);
    const action = canCancelBeforeStart ? "cancel" : canDelete ? "delete" : canCancelAfterEnd ? "cancel" : null;
    if (!action) {
      alert("Cannot cancel/delete: match not finished or window expired");
      return;
    }
    let res = await authFetchWithRetry(`/api/matches/${match._id}`, {
      method: "PATCH",
      body: JSON.stringify({ action })
    });
    if (!res.ok) {
      const err = await safeJson(res);
      const code = (err?.code || err?.error || err?.message || "").toString();
      // Fallback for older backend: if cancel rejected with MATCH_NOT_FINISHED, try delete
      if (action === "cancel" && (code.includes("MATCH_NOT_FINISHED") || res.status === 400)) {
        res = await authFetchWithRetry(`/api/matches/${match._id}`, { method: "PATCH", body: JSON.stringify({ action: "delete" }) });
      }
      if (!res.ok) {
        const err2 = await safeJson(res);
        alert(err2?.message || err2?.code || `Error ${res.status}`);
        return;
      }
    }
    if (action === "delete") router.replace("/");
    else setMatch({ ...match, status: "cancelled" });
  }

  async function confirmMatchResult() {
    if (!match) return;
    setConfirming(true);
    try {
      let currentResult: Result | null = result;
      if (!currentResult) {
        // Auto-create a draft result if none exists yet
        const create = await authFetchWithRetry(`/api/results`, {
          method: "POST",
          body: JSON.stringify({ matchId: match._id, games: [] })
        });
        if (!create.ok) {
          const err = await safeJson(create);
          throw new Error(err?.message || `Error ${create.status}`);
        }
        currentResult = await create.json();
        setResult(currentResult);
      }

      if (!currentResult) throw new Error('Failed to create result');
      if (currentResult.isConfirmed) return;

      const res = await authFetchWithRetry(`/api/results/${currentResult._id}/confirm`, { method: "POST" });
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err?.message || `Error ${res.status}`);
      }
      const data = await res.json();
      const updated: Result | undefined = data?.item;
      if (updated) setResult(updated);
      // Reflect finished status locally
      setMatch({ ...match, status: "finished" });
      alert("Result confirmed");
    } catch (e: any) {
      alert(e?.message || "Failed to confirm result");
    } finally {
      setConfirming(false);
    }
  }

  function openAddResults() {
    router.push(`/match/${id}/confirm`);
  }

  function toggleMember(gameIndex: number, team: 'team1' | 'team2', userId: string) {
    setGamesDraft(prev => {
      const next = [...prev];
      const g = { ...next[gameIndex] } as GameDraft;
      const other = team === 'team1' ? 'team2' : 'team1';
      const teamArr = new Set(g[team]);
      const otherArr = new Set(g[other]);
      if (teamArr.has(userId)) {
        teamArr.delete(userId);
      } else {
        teamArr.add(userId);
        otherArr.delete(userId);
      }
      g[team] = Array.from(teamArr);
      g[other] = Array.from(otherArr);
      next[gameIndex] = g;
      return next;
    });
  }

  function updateScore(gameIndex: number, field: 'team1Score' | 'team2Score', value: string) {
    setGamesDraft(prev => {
      const next = [...prev];
      const g = { ...next[gameIndex] } as GameDraft;
      g[field] = value.replace(/[^0-9]/g, "");
      next[gameIndex] = g;
      return next;
    });
  }

  function addGameRow() {
    setGamesDraft(prev => [...prev, { team1: [], team2: [], team1Score: 0, team2Score: 0 }]);
  }

  async function saveResultsDraft() {
    if (!match) return;
    const payloadGames = gamesDraft.map(g => ({
      team1: g.team1,
      team2: g.team2,
      team1Score: Number(g.team1Score) || 0,
      team2Score: Number(g.team2Score) || 0,
    }));
    if (!result) {
      const create = await authFetchWithRetry(`/api/results`, { method: 'POST', body: JSON.stringify({ matchId: match._id, games: payloadGames }) });
      if (!create.ok) {
        const err = await safeJson(create); alert(err?.message || `Error ${create.status}`); return;
      }
      const r = await create.json();
      setResult(r);
      return r as Result;
    } else {
      const put = await authFetchWithRetry(`/api/results/${result._id}`, { method: 'PUT', body: JSON.stringify({ games: payloadGames }) });
      if (!put.ok) {
        const err = await safeJson(put); alert(err?.message || `Error ${put.status}`); return;
      }
      const r = await put.json();
      setResult(r);
      return r as Result;
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!match) return <div className="p-6">Not found</div>;

  const dt = new Date(match.startDateTime);
  const dateStr = dt.toLocaleDateString();
  const timeStr = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const participantsCount = Array.isArray(match.participants) ? match.participants.length : 0;
  const isUserParticipant = !!user && Array.isArray(match.participants) && match.participants.some(p => p._id === (user._id || (user as any).id));
  const isResultConfirmed = !!result?.isConfirmed;
  const canAddResults = participantsCount >= 4 && isUserParticipant && !isResultConfirmed && match.status !== 'cancelled';
  const start = new Date(match.startDateTime);
  const end = new Date(start.getTime() + match.duration * 60000);
  const now = new Date();
  const hasResult = !!result;
  const canCancelBeforeStart = now < start && !hasResult;
  const canDelete = now < start && hasResult; // practically never, but keep for consistency
  const canCancelAfterEnd = now > end && !hasResult && (now.getTime() - end.getTime() <= 48 * 60 * 60 * 1000);
  const cancelAction = canCancelBeforeStart ? (participantsCount <= 1 ? 'delete' : 'cancel') : canDelete ? 'delete' : null;
  const cancelLabel = (canCancelBeforeStart && participantsCount <= 1) || canDelete ? 'Delete match' : 'Cancel match';

  return (
    <div className="mx-auto w-full max-w-3xl p-6 space-y-6">
      <div>
        <Button variant="ghost" onClick={() => router.back()}>← Back</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{match.place}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-baseline gap-4"><div className="w-28 text-muted-foreground">Date</div><div className="font-semibold">{dateStr}</div></div>
          <div className="flex items-baseline gap-4"><div className="w-28 text-muted-foreground">Start time</div><div className="font-semibold">{timeStr}</div></div>
          <div className="flex items-baseline gap-4"><div className="w-28 text-muted-foreground">Level</div><div className="font-semibold">{match.level}</div></div>
          <div className="flex items-baseline gap-4"><div className="w-28 text-muted-foreground">Visibility</div><div className="font-semibold">{match.isPrivate ? "Private" : "Public"}</div></div>
          <div className="flex items-baseline gap-4"><div className="w-28 text-muted-foreground">Creator</div><div className="font-semibold">{match.creator?.name || match.creator?.email}</div></div>
          {match.status === 'cancelled' && (
            <div className="flex items-baseline gap-4"><div className="w-28 text-muted-foreground">Status</div><div className="font-semibold text-destructive">Cancelled</div></div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button onClick={leaveMatch} className="shrink-0">Leave match</Button>
            {(user && match.creator?._id && (user._id || user.id) === match.creator._id && match.status !== 'cancelled') && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={!cancelAction} className="shrink-0">{cancelLabel}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{cancelLabel}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Это действие повлияет на доступность матча для игроков. Подтвердите действие.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => cancelMatch()}>{cancelLabel}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canAddResults && (
              <Button onClick={openAddResults} className="shadow shrink-0">Add result</Button>
            )}
            <Button className="ml-0 sm:ml-auto shrink-0" variant="secondary" onClick={() => setShareOpen(true)}>Share</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {match.participants?.map((p) => {
              const js = (match.joinSnapshots || []).find(s => s.userId === p._id);
              const r = js?.rating ?? p.rating;
              return (
                <Link key={p._id} href={`/profile/${p._id}`} className="rounded-md border p-3 shadow-xs flex items-center justify-between hover:bg-muted/50">
                  <div className="font-medium text-sm">{p.name || maskEmail(p.email)}</div>
                  <Badge variant="secondary" className="text-xs">★ {formatRating(r)}</Badge>
                </Link>
              )
            })}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Add existing player</div>
              <Input
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            {searching ? (
              <div className="text-sm text-muted-foreground">Searching…</div>
            ) : results.length ? (
              <ul className="divide-y rounded-md border">
                {results.map((u) => (
                  <li key={u._id} className="flex items-center justify-between p-2 text-sm">
                    <div>
                      <div className="font-medium">{u.name || maskEmail(u.email)}</div>
                      <div className="text-muted-foreground text-xs">{maskEmail(u.email)}</div>
                    </div>
                    <Button size="sm" disabled={adding === u.email} onClick={() => addPlayer(u.email)}>Add</Button>
                  </li>
                ))}
              </ul>
            ) : search.length >= 2 ? (
              <div className="text-sm text-muted-foreground">No results</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">W</TableHead>
                  <TableHead className="text-right">L</TableHead>
                  <TableHead className="text-right">Δ rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.participants
                  .slice()
                  .sort((a, b) => (b.wins - a.wins) || ((b.ratingDelta || 0) - (a.ratingDelta || 0)))
                  .map((p) => {
                    const delta = Number(p.ratingDelta || 0);
                    const deltaStr = `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
                    return (
                      <TableRow key={String(p.userId)}>
                        <TableCell className="font-medium">{p.name || p.email}</TableCell>
                        <TableCell className="text-right">{p.wins}</TableCell>
                        <TableCell className="text-right">{p.losses}</TableCell>
                        <TableCell className={`text-right ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{deltaStr}</TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share match</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap break-all font-mono">
            {shareText}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => { if (navigator?.clipboard) navigator.clipboard.writeText(shareText); }}>Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Confirm Results modal */}
      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add results</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {gamesDraft.map((g, gi) => (
              <div key={gi} className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Game {gi + 1}</div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Team 1</div>
                    <div className="space-y-2">
                      {match.participants.map((p) => {
                        const checked = g.team1.includes(p._id);
                        return (
                          <label key={p._id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={checked} onCheckedChange={() => toggleMember(gi, 'team1', p._id)} />
                            <span>{p.name || p.email}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Team 2</div>
                    <div className="space-y-2">
                      {match.participants.map((p) => {
                        const checked = g.team2.includes(p._id);
                        return (
                          <label key={p._id} className="flex items-center gap-2 text-sm">
                            <Checkbox checked={checked} onCheckedChange={() => toggleMember(gi, 'team2', p._id)} />
                            <span>{p.name || p.email}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="text-xs text-muted-foreground">Score</div>
                  <Input className="w-16" value={g.team1Score} onChange={(e) => updateScore(gi, 'team1Score', e.target.value)} />
                  <span className="text-muted-foreground">:</span>
                  <Input className="w-16" value={g.team2Score} onChange={(e) => updateScore(gi, 'team2Score', e.target.value)} />
                </div>
              </div>
            ))}
            <div>
              <Button variant="secondary" onClick={addGameRow}>Add game</Button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="secondary" onClick={async () => { await saveResultsDraft(); }}>Save draft</Button>
            <Button onClick={async () => { const r = await saveResultsDraft(); if (r) await confirmMatchResult(); setResultsOpen(false); }} disabled={confirming}>
              {confirming ? 'Confirming…' : 'Save & Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}


