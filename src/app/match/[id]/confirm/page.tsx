"use client";

import * as React from "react";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2 } from "lucide-react";

type UserRef = { _id: string; name?: string; email?: string };
type Game = { team1: string[]; team2: string[]; team1Score: number | ""; team2Score: number | "" };

type MatchDto = {
  _id: string;
  title?: string;
  place?: string;
  level?: string;
  startDateTime?: string;
  participants?: (string | UserRef)[];
  creator?: string | UserRef;
};

type ResultDto = {
  _id: string;
  match: string | MatchDto;
  games: Game[];
  isConfirmed: boolean;
};

function normalizeId(x: any): string | null {
  if (!x) return null;
  if (typeof x === "string") return x;
  return (x._id as string) ?? (x.id as string) ?? null;
}

export default function ConfirmResultPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const matchId = params?.id;
  const { user, loading } = useAuth();

  const [match, setMatch] = React.useState<MatchDto | null>(null);
  const [result, setResult] = React.useState<ResultDto | null>(null);
  const [games, setGames] = React.useState<Game[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [step, setStep] = React.useState<"idle" | "select1" | "select2" | "score">("idle");
  const [wipTeam1, setWipTeam1] = React.useState<[string, string]>(["", ""]);
  const [wipTeam2, setWipTeam2] = React.useState<[string, string]>(["", ""]);
  const [wipScore1, setWipScore1] = React.useState<string>("");
  const [wipScore2, setWipScore2] = React.useState<string>("");

  React.useEffect(() => {
    if (!loading && !user) {
      const next = pathname ? `?next=${encodeURIComponent(String(pathname))}` : "";
      router.replace(`/login${next}`);
    }
  }, [loading, user, router, pathname]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setError(null);
      try {
        const resMatch = await authFetchWithRetry(`/api/matches/${matchId}`);
        if (!resMatch.ok) throw new Error("Failed to load match");
        const matchData: MatchDto = await resMatch.json();
        if (cancelled) return;
        setMatch(matchData);

        const resResult = await authFetchWithRetry(`/api/results/${matchId}`);
        if (resResult.ok) {
          const resultData: ResultDto = await resResult.json();
          if (cancelled) return;
          setResult(resultData);
          setGames(
            (resultData.games || []).map(g => ({
              team1: (g.team1 || []).map(String),
              team2: (g.team2 || []).map(String),
              team1Score: (g as any).team1Score ?? "",
              team2Score: (g as any).team2Score ?? "",
            }))
          );
        } else if (resResult.status === 404) {
          setResult(null);
          setGames([]);
        } else {
          // treat other errors as non-blocking, allow draft create
          setResult(null);
          setGames([]);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load data");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    if (user && matchId) loadAll();
    return () => { cancelled = true; };
  }, [user, matchId]);

  const participants: UserRef[] = React.useMemo(() => {
    const arr = Array.isArray(match?.participants) ? match!.participants : [];
    const map = new Map<string, UserRef>();
    for (const p of arr) {
      const id = normalizeId(p);
      if (!id) continue;
      const obj: UserRef = typeof p === "string" ? { _id: id } : { _id: id, name: p.name, email: p.email };
      map.set(id, obj);
    }
    return Array.from(map.values()).sort((a, b) => (a.name || a.email || a._id).localeCompare(b.name || b.email || b._id));
  }, [match?.participants]);

  const participantsMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) map.set(p._id, p.name || p.email || p._id);
    return map;
  }, [participants]);

  const startAddResult = React.useCallback(() => {
    setEditingIndex(null);
    setWipTeam1(["", ""]);
    setWipTeam2(["", ""]);
    setWipScore1("");
    setWipScore2("");
    setStep("select1");
  }, []);

  const startEditResult = React.useCallback((idx: number) => {
    const g = games[idx];
    setEditingIndex(idx);
    setWipTeam1([g.team1[0] || "", g.team1[1] || ""]);
    setWipTeam2([g.team2[0] || "", g.team2[1] || ""]);
    setWipScore1(g.team1Score === "" ? "" : String(g.team1Score));
    setWipScore2(g.team2Score === "" ? "" : String(g.team2Score));
    setStep("select1");
  }, [games]);

  const removeGame = React.useCallback((idx: number) => {
    setGames(g => g.filter((_, i) => i !== idx));
  }, []);

  const validateFormGame = React.useCallback(() => {
    const t1 = wipTeam1;
    const t2 = wipTeam2;
    if (!t1[0] || !t1[1] || !t2[0] || !t2[1]) return "Each team must have two players";
    if (t1[0] === t1[1] || t2[0] === t2[1]) return "A team cannot contain the same player twice";
    if (t1.includes(t2[0]) || t1.includes(t2[1])) return "A player cannot be in both teams";
    if (wipScore1 === "" || wipScore2 === "") return "Scores are required";
    const s1 = Math.max(0, parseInt(wipScore1, 10) || 0);
    const s2 = Math.max(0, parseInt(wipScore2, 10) || 0);
    if (!Number.isFinite(s1) || !Number.isFinite(s2)) return "Scores must be numbers";
    return null;
  }, [wipTeam1, wipTeam2, wipScore1, wipScore2]);

  const saveWipGame = React.useCallback(async () => {
    const err = validateFormGame();
    if (err) { setError(err); return; }
    const s1 = wipScore1 === "" ? "" : Math.max(0, parseInt(wipScore1, 10) || 0);
    const s2 = wipScore2 === "" ? "" : Math.max(0, parseInt(wipScore2, 10) || 0);
    const game: Game = { team1: [...wipTeam1], team2: [...wipTeam2], team1Score: s1, team2Score: s2 } as Game;
    const nextGames = (() => {
      const snapshot = [...games];
      if (editingIndex == null) snapshot.push(game); else snapshot[editingIndex] = game;
      return snapshot;
    })();
    setGames(nextGames);
    // persist with the exact array we just computed
    await persistDraft(nextGames);
    setStep("idle");
  }, [editingIndex, wipTeam1, wipTeam2, wipScore1, wipScore2, validateFormGame]);

  const toggleMember = React.useCallback((team: 1 | 2, id: string, nextChecked?: boolean | "indeterminate") => {
    const clampTwo = (arr: [string, string]) => {
      const unique = Array.from(new Set(arr.filter(Boolean)));
      return [unique[0] || "", unique[1] || ""] as [string, string];
    };
    if (team === 1) {
      setWipTeam1(prev => {
        let next: [string, string] = [prev[0], prev[1]];
        const inTeam = next.includes(id);
        const want = nextChecked === undefined ? !inTeam : !!nextChecked;
        if (!want) {
          next = next[0] === id ? ["", next[1]] : next[1] === id ? [next[0], ""] : next;
          return clampTwo(next);
        }
        setWipTeam2(t2 => (t2[0] === id ? ["", t2[1]] : t2[1] === id ? [t2[0], ""] : t2));
        if (inTeam) return clampTwo(next);
        if (!next[0]) next = [id, next[1]]; else if (!next[1]) next = [next[0], id];
        return clampTwo(next);
      });
    } else {
      setWipTeam2(prev => {
        let next: [string, string] = [prev[0], prev[1]];
        const inTeam = next.includes(id);
        const want = nextChecked === undefined ? !inTeam : !!nextChecked;
        if (!want) {
          next = next[0] === id ? ["", next[1]] : next[1] === id ? [next[0], ""] : next;
          return clampTwo(next);
        }
        setWipTeam1(t1 => (t1[0] === id ? ["", t1[1]] : t1[1] === id ? [t1[0], ""] : t1));
        if (inTeam) return clampTwo(next);
        if (!next[0]) next = [id, next[1]]; else if (!next[1]) next = [next[0], id];
        return clampTwo(next);
      });
    }
  }, []);

  const saveAndConfirm = React.useCallback(() => {
    const err = validateFormGame();
    if (err) { setError(err); return; }
    saveWipGame();
    // onConfirm is defined later; defer call
    setTimeout(() => { void onConfirm(); }, 0);
  }, [saveWipGame, validateFormGame]);

  const toPayload = React.useCallback((arr: Game[]) => {
    const uniq2 = (a: string[]) => Array.from(new Set(a.filter(Boolean))).slice(0, 2);
    return arr.map(g => ({
      team1: uniq2(g.team1 as string[]),
      team2: uniq2(g.team2 as string[]),
      team1Score: g.team1Score === "" ? 0 : Number(g.team1Score),
      team2Score: g.team2Score === "" ? 0 : Number(g.team2Score),
    }));
  }, []);

  const canConfirm = React.useMemo(() => {
    if (!games.length) return false;
    for (const g of games) {
      const u1 = Array.from(new Set(g.team1.filter(Boolean)));
      const u2 = Array.from(new Set(g.team2.filter(Boolean)));
      if (u1.length !== 2 || u2.length !== 2) return false;
      if (u1[0] === u1[1] || u2[0] === u2[1]) return false;
      if (u1.includes(u2[0]) || u1.includes(u2[1])) return false;
      if (g.team1Score === "" || g.team2Score === "") return false;
    }
    return true;
  }, [games]);

  const is24hExpired = React.useMemo(() => {
    if (!match?.startDateTime) return false;
    const start = new Date(match.startDateTime);
    const diffHours = (Date.now() - start.getTime()) / (1000 * 60 * 60);
    return diffHours > 24;
  }, [match?.startDateTime]);

  const persistDraft = React.useCallback(async (override?: Game[]): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const payloadGames = toPayload(override ?? games);
      if (!payloadGames.length) {
        setError('At least one game is required');
        return false;
      }
      // Discover current server draft to avoid race/state mismatches
      let currentId: string | null = result?._id || null;
      if (!currentId) {
        const getRes = await authFetchWithRetry(`/api/results/${matchId}`);
        if (getRes.ok) {
          const r: ResultDto = await getRes.json();
          currentId = r?._id || null;
          setResult(r);
        }
      }
      if (!currentId) {
        const createRes = await authFetchWithRetry(`/api/results`, { method: "POST", body: JSON.stringify({ matchId, games: payloadGames }) });
        if (!createRes.ok) throw new Error(await createRes.text());
        const created: ResultDto = await createRes.json();
        setResult(created);
      } else {
        const putRes = await authFetchWithRetry(`/api/results/${currentId}`, { method: "PUT", body: JSON.stringify({ games: payloadGames }) });
        if (!putRes.ok) throw new Error(await putRes.text());
        const updated: ResultDto = await putRes.json();
        setResult(updated);
      }
      return true;
    } catch (e: any) {
      setError(e?.message || "Failed to save draft");
      return false;
    } finally {
      setSaving(false);
    }
  }, [result, matchId, games, toPayload]);

  const onConfirm = React.useCallback(async () => {
    if (!canConfirm) return;
    setConfirming(true);
    setError(null);
    try {
      // 1) Persist current games to draft (create or update)
      const ok = await persistDraft();
      if (!ok) return;
      // 2) Get latest result id
      let latest: ResultDto | null = result;
      if (!latest) {
        const resGet = await authFetchWithRetry(`/api/results/${matchId}`);
        if (resGet.ok) latest = await resGet.json();
      }
      if (!latest) throw new Error('Failed to get result draft');
      // 3) Confirm
      const res = await authFetchWithRetry(`/api/results/${latest._id}/confirm`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      // reload and redirect to match page
      const resAfter = await authFetchWithRetry(`/api/results/${matchId}`);
      if (resAfter.ok) {
        const r: ResultDto = await resAfter.json();
        setResult(r);
      }
      // Auto-redirect to the match page
      router.push(`/match/${matchId}`);
    } catch (e: any) {
      setError(e?.message || "Failed to confirm result");
    } finally {
      setConfirming(false);
    }
  }, [canConfirm, matchId, toPayload, games, result]);

  const subtitle = React.useMemo(() => {
    if (!match?.startDateTime) return "";
    const d = new Date(match.startDateTime);
    const dateStr = d.toLocaleDateString("en-US");
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${dateStr} • ${timeStr}`;
  }, [match?.startDateTime]);

  if (loading || !loaded) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Confirm result</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Confirm result</CardTitle>
        </CardHeader>
        <CardContent>
          {match ? (
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{match.title || match.place || "Match"}</div>
                  <div className="text-sm text-muted-foreground">{subtitle}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => router.push(`/match/${matchId}`)}>Back to match</Button>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          ) : null}

          <div className="space-y-4">
            {step === "idle" ? (
              <ScrollArea className="h-[60vh] overflow-hidden rounded border p-2 bg-card">
                <div className="space-y-3 pb-20">
                  {games.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No games yet</div>
                  ) : (
                    games.map((g, idx) => {
                      const pName = (id: string) => {
                        const p = participants.find(x => x._id === id);
                        return p?.name || p?.email || id;
                      };
                      return (
                      <div key={idx} className="relative rounded border p-3 sm:p-4">
                        <div className="mb-2 text-sm font-medium">Game {idx + 1}</div>
                        <div className="absolute right-2 top-2 flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => startEditResult(idx)} aria-label="Edit game">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {!result?.isConfirmed && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" aria-label="Delete game">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Удалить гейм?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Действие необратимо. Гейм будет удалён из черновика результата.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => removeGame(idx)}>Удалить</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                        {(() => {
                          const t1 = Number(g.team1Score);
                          const t2 = Number(g.team2Score);
                          const t1Win = t1 > t2; // kept for future, but style now same
                          const t2Win = t2 > t1;
                          return (
                            <div className="grid items-center gap-2 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                              <div className="min-w-0 flex flex-row flex-wrap items-center gap-1">
                                <Badge className="px-2 py-0.5 text-xs w-[72px] sm:w-20 md:w-[120px] truncate justify-start">
                                  {pName(g.team1[0])}
                                </Badge>
                                <Badge className="px-2 py-0.5 text-xs w-[72px] sm:w-20 md:w-[120px] truncate justify-start">
                                  {pName(g.team1[1])}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-center gap-2">
                                <div className="text-3xl font-bold leading-none md:text-4xl">{t1}</div>
                                <span className="text-muted-foreground">:</span>
                                <div className="text-3xl font-bold leading-none md:text-4xl">{t2}</div>
                              </div>
                              <div className="min-w-0 flex flex-row flex-wrap justify-end items-center gap-1">
                                <Badge className="px-2 py-0.5 text-xs w-[72px] sm:w-20 md:w-[120px] truncate justify-start">
                                  {pName(g.team2[0])}
                                </Badge>
                                <Badge className="px-2 py-0.5 text-xs w-[72px] sm:w-20 md:w-[120px] truncate justify-start">
                                  {pName(g.team2[1])}
                                </Badge>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            ) : step === "select1" ? (
              <div className="rounded border p-4 space-y-3 bg-card">
                <div className="text-sm font-medium">Select participants for Team 1</div>
                <div className="space-y-2">
                  {participants.map(p => {
                    const checked = wipTeam1.includes(p._id);
                    const disabled = !checked && wipTeam1.filter(Boolean).length >= 2;
                    return (
                      <div key={p._id} className="flex items-center gap-2">
                        <Checkbox checked={checked} disabled={disabled} onCheckedChange={v => toggleMember(1, p._id, v)} />
                        <span className="text-sm">{p.name || p.email || p._id}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep("idle")}>Cancel</Button>
                  <Button onClick={() => setStep("select2")} disabled={wipTeam1.filter(Boolean).length !== 2}>Next</Button>
                </div>
              </div>
            ) : step === "select2" ? (
              <div className="rounded border p-4 space-y-3 bg-card">
                <div className="text-sm font-medium">Select participants for Team 2</div>
                <div className="space-y-2">
                  {participants.filter(p => !wipTeam1.includes(p._id)).map(p => {
                    const checked = wipTeam2.includes(p._id);
                    const disabled = !checked && wipTeam2.filter(Boolean).length >= 2;
                    return (
                      <div key={p._id} className="flex items-center gap-2">
                        <Checkbox checked={checked} disabled={disabled} onCheckedChange={v => toggleMember(2, p._id, v)} />
                        <span className="text-sm">{p.name || p.email || p._id}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep("select1")}>Back</Button>
                  <Button variant="outline" onClick={() => setStep("idle")}>Cancel</Button>
                  <Button onClick={() => setStep("score")} disabled={wipTeam2.filter(Boolean).length !== 2}>Next</Button>
                </div>
              </div>
            ) : (
              <div className="rounded border p-4 space-y-3 bg-card">
                <div className="text-sm font-medium">Enter score</div>
                <div className="text-xs text-muted-foreground">Teams</div>
                <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                  <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                    <Badge variant="secondary">{participantsMap.get(wipTeam1[0] || "") || "—"}</Badge>
                    <Badge variant="secondary">{participantsMap.get(wipTeam1[1] || "") || "—"}</Badge>
                  </div>
                  <div className="flex items-center justify-center text-muted-foreground">vs</div>
                  <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:justify-end md:items-center">
                    <Badge variant="secondary">{participantsMap.get(wipTeam2[0] || "") || "—"}</Badge>
                    <Badge variant="secondary">{participantsMap.get(wipTeam2[1] || "") || "—"}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:w-1/2">
                  <div className="space-y-2">
                    <Label>Team 1 score</Label>
                    <Input inputMode="numeric" value={wipScore1} onChange={e => setWipScore1(e.target.value)} disabled={is24hExpired || !!result?.isConfirmed} />
                  </div>
                  <div className="space-y-2">
                    <Label>Team 2 score</Label>
                    <Input inputMode="numeric" value={wipScore2} onChange={e => setWipScore2(e.target.value)} disabled={is24hExpired || !!result?.isConfirmed} />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep("select2")}>Back</Button>
                  <Button variant="outline" onClick={() => setStep("idle")}>Cancel</Button>
                  <Button onClick={saveWipGame} disabled={is24hExpired || !!result?.isConfirmed || wipScore1 === "" || wipScore2 === ""}>Add result</Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              {!result?.isConfirmed && (
                <Button variant="secondary" onClick={startAddResult}>Add result</Button>
              )}
              <div className="grow" />
              {!result?.isConfirmed ? (
                step === "idle" ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={games.length === 0 || confirming || result?.isConfirmed || is24hExpired}>
                        {result?.isConfirmed ? "Confirmed" : confirming ? "Confirming..." : "Confirm result"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm result?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action is irreversible. After confirmation, the result cannot be edited and ratings will be recalculated.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => setTimeout(() => { void onConfirm(); }, 0)}>Confirm</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null
              ) : (
                <Button onClick={() => router.push(`/match/${matchId}`)} variant="secondary">Go to match</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


