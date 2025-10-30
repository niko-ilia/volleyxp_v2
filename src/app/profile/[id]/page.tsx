"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authFetchWithRetry } from "@/lib/auth/api";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

type PublicProfile = { id: string; name: string; rating?: number; createdAt?: string; emailMasked?: string };

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id as string;
  const [data, setData] = React.useState<PublicProfile | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [matches, setMatches] = React.useState<any[] | null>(null);
  const [matchesError, setMatchesError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 5;
  const [statsByMatchId, setStatsByMatchId] = React.useState<Record<string, { wins: number; losses: number }>>({});
  const [summary, setSummary] = React.useState<{ total: number; wins: number; losses: number; winPct: number }>({ total: 0, wins: 0, losses: 0, winPct: 0 });
  const [series, setSeries] = React.useState<Array<{ label: string; delta: number; rating: number; dateStr: string }>>([]);
  const [seriesLoading, setSeriesLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await authFetchWithRetry(`/api/users/${userId}/public`);
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const body = await res.json();
        const item = body?.item || body;
        if (!cancelled) setData({ id: item.id || item._id, name: item.name, rating: item.rating, createdAt: item.createdAt, emailMasked: item.emailMasked });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (userId) load();
    return () => { cancelled = true; };
  }, [userId]);

  const createdAtFmt = React.useMemo(() => {
    if (!data?.createdAt) return '—';
    const d = new Date(data.createdAt);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US');
  }, [data?.createdAt]);

  // Load public match history and compute summary
  React.useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!userId) return;
      setMatchesError(null);
      try {
        setSeriesLoading(true);
        const res = await authFetchWithRetry(`/api/users/${userId}/match-history`);
        if (!res.ok) throw new Error(`Failed to load history: ${res.status}`);
        const body = await res.json();
        const itemsRaw = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
        // newest first by match date
        const items = itemsRaw.slice().sort((a: any, b: any) => {
          const da = new Date(a?.date || a?.startDateTime || 0).getTime();
          const db = new Date(b?.date || b?.startDateTime || 0).getTime();
          return db - da;
        });
        if (cancelled) return;
        setMatches(items);
        setPage(1);
        // Align summary semantics with own profile: aggregate by games, not matches
        // Consider only finished entries (presence of numeric wins/losses)
        const finished = items.filter((it: any) => {
          const w = Number(it?.wins ?? 0);
          const l = Number(it?.losses ?? 0);
          return Number.isFinite(w) || Number.isFinite(l);
        });
        const total = finished.length; // matches count (finished only)
        let sumWins = 0, sumLosses = 0;
        const map: Record<string, { wins: number; losses: number }> = {};
        for (const it of finished) {
          const id = it.matchId || it._id;
          const w = Number(it.wins ?? 0);
          const l = Number(it.losses ?? 0);
          if (id) map[id] = { wins: w, losses: l };
          sumWins += w; sumLosses += l;
        }
        setStatsByMatchId(map);
        const gamesTotal = sumWins + sumLosses;
        setSummary({ total, wins: sumWins, losses: sumLosses, winPct: gamesTotal ? sumWins / gamesTotal : 0 });

        // Build rating series per match (last 10), only confirmed results (has details)
        const points: Array<{ ts: number; label: string; delta: number; rating: number; dateStr: string }> = [];
        let currentRating: number | null = null;
        for (const h of items.slice().sort((a: any, b: any) => new Date(a?.date||0).getTime() - new Date(b?.date||0).getTime())) {
          const d0 = h?.date ? new Date(h.date) : null;
          const ts = d0 && !isNaN((d0 as any)) ? d0.getTime() : 0;
          const details = Array.isArray(h?.details) ? h.details : [];
          if (!details.length) continue; // skip not confirmed
          const sumDelta = details.reduce((acc: number, g: any) => acc + (Number(g?.delta) || 0), 0);
          const matchEndRating = Number(h?.newRating);
          let startRating: number | null = currentRating;
          if (startRating === null || !Number.isFinite(startRating as any)) {
            startRating = Number.isFinite(matchEndRating) ? matchEndRating - sumDelta : 0;
          }
          const endRating: number = Number.isFinite(matchEndRating) ? matchEndRating : Number(startRating) + sumDelta;
          const dateStr = d0 ? d0.toLocaleDateString('en-US') : '';
          points.push({ ts, label: dateStr, delta: sumDelta, rating: endRating, dateStr });
          currentRating = endRating;
        }
        points.sort((a,b)=>a.ts-b.ts);
        const last10 = points.slice(Math.max(0, points.length - 10));
        setSeries(last10.map(p => ({ label: p.label, delta: p.delta, rating: Number(p.rating.toFixed ? p.rating.toFixed(2) : p.rating), dateStr: p.dateStr })));
      } catch (e: any) {
        if (!cancelled) setMatchesError(e?.message || 'Failed to load history');
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [userId]);

  const chartDomain = React.useMemo(() => {
    const ratings = series.map(s => Number(s?.rating) || 0);
    if (!ratings.length) return [0, 1] as [number, number];
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const yMin = Math.max(0, min - 1);
    const yMax = max + 0.5;
    return [yMin, yMax] as [number, number];
  }, [series]);

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : error ? (
            <div className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">Name</div>
                <div className="text-sm text-muted-foreground">{data?.name || '—'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Email</div>
                <div className="text-sm text-muted-foreground">{data?.emailMasked || 'hidden'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium">Registration date</div>
                <div className="text-sm text-muted-foreground">{createdAtFmt}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats summary (read-only) */}
      <div className="mt-8 max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-center">
              {/* Row 1: Matches, Wins, Losses */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Matches</div>
                  <div className="text-xl font-semibold">{summary.total}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Wins</div>
                  <div className="text-xl font-semibold">{summary.wins}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Losses</div>
                  <div className="text-xl font-semibold">{summary.losses}</div>
                </div>
              </div>

              {/* Row 2: Win %, Rating */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Win %</div>
                  <div className="text-xl font-semibold">{Math.round(summary.winPct * 100)}%</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Rating</div>
                  <div className="text-xl font-semibold">{data?.rating?.toFixed ? data.rating.toFixed(2) : (data?.rating ?? '—')}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rating history chart (public) */}
      <div className="mt-8 max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Rating — last 10 matches</CardTitle>
          </CardHeader>
          <CardContent>
            {!series.length && seriesLoading ? (
              <div className="h-40 w-full animate-pulse rounded bg-muted" />
            ) : !series.length ? (
              <div className="text-xs text-muted-foreground">No matches yet</div>
            ) : (
              <ChartContainer config={{ rating: { label: "Rating", color: "hsl(var(--chart-1))" } }} className="w-full">
                <AreaChart data={series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="ratingFillPublic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" hide />
                  <YAxis tickLine={false} axisLine={false} width={40} domain={chartDomain} tickFormatter={(v: number) => (Number.isFinite(v) ? v.toFixed(2) : String(v))} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideIndicator
                        formatter={(value: any, name: any, item: any) => {
                          const p = item?.payload as any;
                          const dv = Number(p?.delta || 0);
                          const color = dv > 0 ? 'text-green-600' : dv < 0 ? 'text-red-600' : 'text-muted-foreground';
                          const rating = Number(p?.rating);
                          const signed = dv > 0 ? `+${dv.toFixed(2)}` : dv.toFixed(2);
                          return (
                            <div className="flex flex-col gap-0.5">
                              <div className="font-mono">Rating {Number.isFinite(rating) ? rating.toFixed(2) : '—'}</div>
                              <div className={`font-mono ${color}`}>Δ {signed}</div>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <Area type="monotone" dataKey="rating" stroke="hsl(var(--chart-1))" fill="url(#ratingFillPublic)" strokeWidth={2} dot={{ r: 5 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Matches list (read-only) */}
      <div className="mt-8 max-w-xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Matches</CardTitle>
          </CardHeader>
          <CardContent>
            {matchesError ? (
              <div className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">{matchesError}</div>
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
                {(matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)).map((m: any) => {
                  const dt = m?.date ? new Date(m.date) : (m?.startDateTime ? new Date(m.startDateTime) : null);
                  const dateStr = dt ? dt.toLocaleDateString('en-US') : '';
                  const timeStr = dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const stat = statsByMatchId[m.matchId || m._id || ''] || { wins: undefined as any, losses: undefined as any };
                  const href = m.matchId ? `/match/${m.matchId}` : (m._id ? `/match/${m._id}` : '#');
                  return (
                    <Link key={m.matchId || m._id} href={href} className="block">
                      <div className="flex items-center justify-between rounded border p-3 hover:bg-muted/50">
                        <div>
                          <div className="font-medium">{m.place || m.title || 'Match'}</div>
                          <div className="text-xs text-muted-foreground">{dateStr}{timeStr ? ` • ${timeStr}` : ''}</div>
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
                  <Button size="sm" variant="outline" disabled={page===1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Back</Button>
                  <div className="text-xs text-muted-foreground">Page {page} of {Math.max(1, Math.ceil(matches.length / PAGE_SIZE))}</div>
                  <Button size="sm" variant="outline" disabled={page>=Math.ceil(matches.length/PAGE_SIZE)} onClick={()=>setPage(p=>Math.min(Math.ceil(matches.length/PAGE_SIZE), p+1))}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


