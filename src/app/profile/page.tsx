"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, authFetchWithRetry } from "@/lib/auth/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, X } from "lucide-react";
import { saveAuth, getToken, getRefreshToken } from "@/lib/auth/storage";
import Image from "next/image";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

type ProfileResponse = {
  id: string;
  name: string;
  email: string;
  rating?: number;
  createdAt?: string;
  telegramId?: number | string | null;
  telegramUsername?: string | null;
  telegramChannel?: { id?: string; username?: string; title?: string; linked?: boolean; addedAt?: string; verifiedAt?: string } | null;
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
  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  const [matchesTotalPages, setMatchesTotalPages] = React.useState(1);
  const [matchesTotal, setMatchesTotal] = React.useState(0);
  const [gamesSeries, setGamesSeries] = React.useState<Array<{ label: string; delta: number; rating: number; dateStr: string }>>([]);
  const [gamesLoading, setGamesLoading] = React.useState<boolean>(false);
  // Dedupe in-flight/attempted stats fetches to avoid network spam on re-renders
  const requestedStatsRef = React.useRef<Set<string>>(new Set());
  // Telegram linking UI state
  const [tgBusy, setTgBusy] = React.useState(false);
  const [tgMsg, setTgMsg] = React.useState<string | null>(null);
  const [isTgMiniApp, setIsTgMiniApp] = React.useState(false);
  const widgetRef = React.useRef<HTMLDivElement | null>(null);
  const TG_BOT = (process.env.NEXT_PUBLIC_TG_BOT_USERNAME as string) || (process.env.NEXT_PUBLIC_TG_BOT_NAME as string) || "";
  const [canRenderWidget, setCanRenderWidget] = React.useState(false);
  const [hostMsg, setHostMsg] = React.useState<string | null>(null);
  const tgUsername = (user as any)?.telegramUsername || (profile as any)?.telegramUsername || null;
  const tgId = (user as any)?.telegramId || (profile as any)?.telegramId || null;
  const isLinked = Boolean(tgId);
  const [tgAvatar, setTgAvatar] = React.useState<string | null>(null);

  // Telegram Channel linking state
  const tgChannel = (profile as any)?.telegramChannel || null as any;
  const [channelInput, setChannelInput] = React.useState<string>("");
  const [channelBusy, setChannelBusy] = React.useState(false);
  const [channelMsg, setChannelMsg] = React.useState<string | null>(null);

  // no password now

  React.useEffect(() => {
    try {
      const wa = (typeof window !== 'undefined' && (window as any).Telegram && (window as any).Telegram.WebApp)
        ? (window as any).Telegram.WebApp
        : null;
      if (wa && wa.initData) setIsTgMiniApp(true);
      if (typeof window !== 'undefined') {
        const isHttps = window.location.protocol === 'https:';
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        setCanRenderWidget(isHttps && !isLocal);
        if (!isHttps || isLocal) setHostMsg('Telegram Login Widget requires an HTTPS public domain whitelisted in BotFather (/setdomain).');
      }
    } catch {}
  }, []);

  // Inject Telegram Login Widget in web (outside Mini App)
  React.useEffect(() => {
    if (isTgMiniApp || !TG_BOT || !canRenderWidget) return;
    const w: any = typeof window !== 'undefined' ? window : {};
    const onMsg = (e: MessageEvent) => {
      if (!e?.data || e.data?.type !== 'tg_link_result') return;
      if (e.data?.ok) {
        setTgMsg('Telegram linked');
        refreshUser();
        authFetchWithRetry('/api/users/profile').then(async (r) => {
          if (!r.ok) return;
          const j = await r.json();
          setProfile(j);
        }).catch(()=>void 0);
      } else {
        setTgMsg(`Link failed: ${e.data?.error || 'unknown'}`);
      }
    };
    try { window.addEventListener('message', onMsg); } catch {}
    // Respond to bridge token requests
    const onNeedToken = (e: MessageEvent) => {
      if (e?.data?.type === 'tg_bridge_need_token') {
        const t = getToken();
        if (t) {
          try { (e.source as WindowProxy)?.postMessage({ type: 'tg_bridge_token', token: t }, '*'); } catch {}
        }
      }
    };
    try { window.addEventListener('message', onNeedToken); } catch {}
    w.onTelegramAuth = async (payload: any) => {
      try {
        const email = profile?.email || (user as any)?.email;
        setTgBusy(true);
        let res = await authFetchWithRetry('/api/auth/link-telegram-authed', {
          method: 'POST',
          body: JSON.stringify({ email, telegramAuthPayload: payload, telegramUser: payload, jwt: getToken() || undefined }),
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          let msg = '';
          try { msg = await res.text(); } catch {}
          if (res.status === 400 && /already linked/i.test(msg)) {
            res = await authFetchWithRetry('/api/auth/link-telegram-authed', {
              method: 'POST',
              body: JSON.stringify({ email, telegramAuthPayload: payload, telegramUser: payload, force: true }),
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (!res.ok) throw new Error(msg || `Link failed: ${res.status}`);
        }
        const data = await res.json();
        saveAuth(data.token, null, data.user);
        setProfile((prev) => prev ? { ...prev, telegramId: data.user?.telegramId ?? (prev as any).telegramId, telegramUsername: data.user?.telegramUsername ?? (prev as any).telegramUsername } as any : prev);
        await refreshUser();
        try {
          const pf = await authFetchWithRetry('/api/users/profile');
          if (pf.ok) setProfile(await pf.json());
        } catch {}
        setTgMsg('Telegram linked');
      } catch (e: any) {
        setTgMsg(e?.message || 'Link failed');
      } finally {
        setTgBusy(false);
      }
    };
    const holder = widgetRef.current;
    try {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.setAttribute('data-telegram-login', TG_BOT);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-userpic', 'false');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      try {
        const origin = window.location.origin;
        const t = getToken();
        const url = new URL(`${origin}/auth/tg-bridge`);
        if (t) url.searchParams.set('jwt', t);
        script.setAttribute('data-auth-url', url.toString());
      } catch {}
      if (holder) {
        holder.innerHTML = '';
        holder.appendChild(script);
      }
    } catch {}
    return () => {
      try { if (holder) holder.innerHTML = ''; } catch {}
      try { delete (w as any).onTelegramAuth; } catch {}
      try { window.removeEventListener('message', onMsg); } catch {}
      try { window.removeEventListener('message', onNeedToken); } catch {}
    };
  }, [isTgMiniApp, TG_BOT, canRenderWidget, profile?.email, user, refreshUser]);

  // Resolve avatar URL if linked
  React.useEffect(() => {
    if (!isLinked) { setTgAvatar(null); return; }
    let url: string | null = null;
    try {
      const w: any = typeof window !== 'undefined' ? window : {};
      const pu = w?.Telegram?.WebApp?.initDataUnsafe?.user?.photo_url;
      if (pu && typeof pu === 'string') url = pu;
    } catch {}
    if (!url && tgUsername) {
      url = `https://t.me/i/userpic/320/${tgUsername}.jpg`;
    }
    setTgAvatar(url);
  }, [isLinked, tgUsername]);

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

  // Unified overview loader: profile summary + paginated matches with embedded stats
  React.useEffect(() => {
    let cancelled = false;
    async function loadOverview(p: number) {
      try {
        setMatchesError(null);
        const res = await authFetchWithRetry(`/api/users/profile-overview?page=${p}&pageSize=${PAGE_SIZE}`);
        if (!res.ok) throw new Error(`Failed to load overview: ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        const sum = body?.summary;
        if (sum && typeof sum === 'object') {
          setStatsSummary({ total: Number(sum.total||0), wins: Number(sum.wins||0), losses: Number(sum.losses||0), winPct: Number(sum.winPct||0) });
        }
        const pageBlock = body?.matches;
        const items = Array.isArray(pageBlock?.items) ? pageBlock.items : [];
        setMatches(items.map((m: any) => ({ _id: m._id, place: m.place, title: m.title, startDateTime: m.startDateTime, level: m.level, status: m.status })));
        setMatchesTotalPages(Number(pageBlock?.totalPages || 1));
        setMatchesTotal(Number(pageBlock?.total || 0));
        // Build stats map from embedded stats
        const per: Record<string, { wins: number; losses: number }> = {};
        for (const m of items) {
          if (m?.stats && (typeof m.stats.wins === 'number' || typeof m.stats.losses === 'number')) {
            per[m._id] = { wins: Number(m.stats.wins||0), losses: Number(m.stats.losses||0) };
          }
        }
        setStatsByMatchId(per);
        setHistoryLoaded(true);
      } catch (e: any) {
        setHistoryLoaded(true);
        setMatchesError(e?.message || 'Failed to load overview');
      }
    }
    if (user) loadOverview(page);
    return () => { cancelled = true; };
  }, [user, page]);

  // Removed old matches loader — overview provides paginated matches

  // Removed per-match fallback stats loader — overview includes stats

  // Removed summary computation — overview provides summary

  // Fetch last 10 games points (rating after each game) for the chart
  React.useEffect(() => {
    let cancelled = false;
    async function loadGames() {
      try {
        setGamesLoading(true);
        const res = await authFetchWithRetry('/api/users/match-history');
        if (!res.ok) throw new Error('Failed to load match history');
        const hist = await res.json();
        if (cancelled) return;
        const items = (Array.isArray(hist) ? hist : []) as Array<any>;
        // Sort matches ascending by date
        items.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
        const points: Array<{ ts: number; label: string; delta: number; rating: number; dateStr: string }> = [];
        let currentRating: number | null = null;
        for (const h of items) {
          const d0 = h?.date ? new Date(h.date) : null;
          const baseTs = d0 && !isNaN((d0 as any)) ? d0.getTime() : 0;
          const details = Array.isArray(h?.details) ? [...h.details].sort((a,b)=> (a?.gameIndex||0) - (b?.gameIndex||0)) : [];
          // Determine start rating for this match from newRating - sum(details.delta)
          const sumDelta = details.reduce((acc: number, g: any) => acc + (Number(g?.delta) || 0), 0);
          const matchEndRating = Number(h?.newRating);
          let startRating = Number.isFinite(matchEndRating) ? matchEndRating - sumDelta : null;
          if (currentRating !== null && Number.isFinite(currentRating)) {
            startRating = currentRating;
          }
          if (startRating === null || !Number.isFinite(startRating)) {
            // Fallback: accumulate from zero
            startRating = 0;
          }
          let r: number = Number(startRating ?? 0);
          for (const g of details) {
            const dv = Number(g?.delta);
            if (!Number.isFinite(dv)) continue;
            r = r + dv;
            const gi = Number(g?.gameIndex ?? 0);
            const ts = baseTs + gi;
            const dateStr = d0 ? d0.toLocaleDateString('en-US') : '';
            const lbl = dateStr ? `${dateStr} • G${gi + 1}` : `G${gi + 1}`;
            points.push({ ts, label: lbl, delta: dv, rating: r, dateStr });
          }
          currentRating = r;
        }
        points.sort((a, b) => a.ts - b.ts);
        const last10 = points.slice(Math.max(0, points.length - 10));
        setGamesSeries(last10.map(p => ({ label: p.label, delta: p.delta, rating: Number(p.rating.toFixed ? p.rating.toFixed(2) : p.rating), dateStr: p.dateStr })));
      } catch {
        setGamesSeries([]);
      } finally {
        setGamesLoading(false);
      }
    }
    if (user) loadGames();
    return () => { cancelled = true; };
  }, [user]);

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

  const chartDomain = React.useMemo(() => {
    const ratings = gamesSeries.map((g) => Number(g?.rating) || 0);
    if (!ratings.length) return [0, 1] as [number, number];
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const yMin = Math.max(0, min - 1);
    const yMax = max + 0.5;
    return [yMin, yMax] as [number, number];
  }, [gamesSeries]);

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

          {/* Telegram linking */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">Telegram</div>
              {isLinked ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-green-600/90 text-white shadow-sm ring-1 ring-inset ring-black/10">
                  Linked
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground shadow-sm ring-1 ring-inset ring-black/5">
                  Not linked
                </span>
              )}
            </div>
            {isLinked ? (
              <div className="flex items-center gap-2">
                {tgAvatar ? (
                  // Use img to avoid Next.js domain allowlist
                  <img src={tgAvatar} alt="Telegram avatar" className="h-8 w-8 rounded-full object-cover" />
                ) : null}
                <div className="text-sm">{tgUsername ? `@${tgUsername}` : `ID: ${tgId}`}</div>
              </div>
            ) : null}
            {!isLinked ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Link your Telegram to enable Mini App login and notifications.</div>
                <div className="flex gap-2 items-center">
                  {isTgMiniApp ? (
                    <Button disabled={tgBusy} onClick={async () => {
                    setTgMsg(null);
                    setTgBusy(true);
                    try {
                      const email = profile?.email || (user as any)?.email;
                      const w: any = typeof window !== 'undefined' ? window : {};
                      const wa = w?.Telegram?.WebApp;
                      if (wa && wa.initDataUnsafe && wa.initData) {
                        const initData = wa.initData as string;
                        const tgUser = wa.initDataUnsafe?.user || null;
                          let res = await authFetchWithRetry('/api/auth/link-telegram-authed', {
                          method: 'POST',
                            body: JSON.stringify({ email, telegramInitData: initData, telegramUser: tgUser, jwt: getToken() || undefined }),
                          headers: { 'Content-Type': 'application/json' }
                        });
                        if (!res.ok) {
                          let msg = '';
                          try { msg = await res.text(); } catch {}
                          if (res.status === 400 && /already linked/i.test(msg)) {
                            res = await authFetchWithRetry('/api/auth/link-telegram-authed', {
                              method: 'POST',
                              body: JSON.stringify({ email, telegramInitData: initData, telegramUser: tgUser, force: true }),
                              headers: { 'Content-Type': 'application/json' }
                            });
                          }
                          if (!res.ok) throw new Error(msg || `Link failed: ${res.status}`);
                        }
                          const data = await res.json();
                          saveAuth(data.token, null, data.user);
                          setProfile((prev) => prev ? { ...prev, telegramId: data.user?.telegramId ?? (prev as any).telegramId, telegramUsername: data.user?.telegramUsername ?? (prev as any).telegramUsername } as any : prev);
                          await refreshUser();
                          try {
                            const pf = await authFetchWithRetry('/api/users/profile');
                            if (pf.ok) setProfile(await pf.json());
                          } catch {}
                          setTgMsg('Telegram linked');
                        return;
                      }
                      setTgMsg('Open this page in Telegram Mini App to link.');
                    } catch (e: any) {
                      setTgMsg(e?.message || 'Link failed');
                    } finally {
                      setTgBusy(false);
                    }
                  }}>
                      {tgBusy ? 'Linking…' : 'Link Telegram'}
                    </Button>
                  ) : null}
                </div>
                {!isTgMiniApp && TG_BOT ? (
                  <div className="flex flex-col items-center gap-2">
                    {hostMsg ? (
                      <div className="text-xs text-muted-foreground">{hostMsg}</div>
                    ) : null}
                    <div ref={widgetRef} />
                  </div>
                ) : null}
                {tgMsg ? (
                  <div className="text-xs text-muted-foreground">{tgMsg}</div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Telegram channel for notifications */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium">Telegram Channel</div>
              {tgChannel?.id ? (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tgChannel?.linked ? 'bg-green-600/90 text-white' : 'bg-yellow-500/80 text-black'} shadow-sm ring-1 ring-inset ring-black/10`}>
                  {tgChannel?.linked ? 'Linked' : 'Pending'}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground shadow-sm ring-1 ring-inset ring-black/5">
                  Not set
                </span>
              )}
            </div>
            {tgChannel?.id ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm">
                    {tgChannel.title || (tgChannel.username ? `@${tgChannel.username}` : tgChannel.id)}
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Unlink channel" disabled={channelBusy} onClick={async () => {
                    setChannelBusy(true); setChannelMsg(null);
                    try {
                      const res = await authFetchWithRetry('/api/users/telegram-channel', { method: 'DELETE' });
                      if (!res.ok) throw new Error(await res.text());
                      setChannelMsg('Channel removed');
                      const pf = await authFetchWithRetry('/api/users/profile'); if (pf.ok) setProfile(await pf.json());
                    } catch (e: any) { setChannelMsg(e?.message || 'Remove failed'); } finally { setChannelBusy(false); }
                  }}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
                {!tgChannel?.linked ? (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" disabled={channelBusy} onClick={async () => {
                      setChannelBusy(true); setChannelMsg(null);
                      try {
                        const res = await authFetchWithRetry('/api/users/telegram-channel/verify', { method: 'POST' });
                        const txt = await res.text();
                        const ok = res.ok; let body: any = null; try { body = JSON.parse(txt); } catch {}
                        if (!ok) throw new Error(body?.message || txt || `Error ${res.status}`);
                        setChannelMsg(body?.ok ? 'Channel linked ✔' : 'Bot is not in the channel');
                        const pf = await authFetchWithRetry('/api/users/profile'); if (pf.ok) setProfile(await pf.json());
                      } catch (e: any) {
                        setChannelMsg(e?.message || 'Verify failed');
                      } finally { setChannelBusy(false); }
                    }}>Verify bot</Button>
                  </div>
                ) : null}
                {channelMsg ? <div className="text-xs text-muted-foreground">{channelMsg}</div> : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Add telegram channel for notifications (e.g. @mychannel or t.me/mychannel).</div>
                <div className="flex gap-2">
                  <Input placeholder="@channel or link" value={channelInput} onChange={(e) => setChannelInput(e.target.value)} />
                  <Button disabled={channelBusy || !channelInput.trim()} onClick={async () => {
                    setChannelBusy(true); setChannelMsg(null);
                    try {
                      const res = await authFetchWithRetry('/api/users/telegram-channel', { method: 'POST', body: JSON.stringify({ channel: channelInput }) });
                      const txt = await res.text();
                      const ok = res.ok; let body: any = null; try { body = JSON.parse(txt); } catch {}
                      if (!ok) throw new Error(body?.message || txt || `Error ${res.status}`);
                      setChannelInput('');
                      setChannelMsg('Channel added. Add the bot to the channel and click Verify.');
                      const pf = await authFetchWithRetry('/api/users/profile'); if (pf.ok) setProfile(await pf.json());
                    } catch (e: any) { setChannelMsg(e?.message || 'Add failed'); } finally { setChannelBusy(false); }
                  }}>Add telegram channel</Button>
                </div>
                {channelMsg ? <div className="text-xs text-muted-foreground">{channelMsg}</div> : null}
              </div>
            )}
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
            <div className="space-y-4 text-center">
              {/* Row 1: Matches, Wins, Losses */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Matches</div>
                  <div className="text-xl font-semibold">{statsSummary?.total ?? 0}</div>
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

              {/* Row 2: Win %, Rating */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Win %</div>
                  <div className="text-xl font-semibold">{statsSummary ? Math.round(statsSummary.winPct * 100) : 0}%</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Rating</div>
                  <div className="text-xl font-semibold">{profile?.rating?.toFixed ? profile.rating.toFixed(2) : (profile?.rating ?? '—')}</div>
                </div>
              </div>

              {/* Rating — last 10 games */}
              <div className="mt-4">
                <div className="text-left text-sm font-medium mb-2">Rating — last 10 games</div>
                {!gamesSeries.length && gamesLoading ? (
                  <div className="h-40 w-full animate-pulse rounded bg-muted" />
                ) : !gamesSeries.length ? (
                  <div className="text-xs text-muted-foreground">No games yet</div>
                ) : (
                  <ChartContainer
                    config={{ rating: { label: "Rating", color: "hsl(var(--chart-1))" } }}
                    className="w-full"
                  >
                    <AreaChart data={gamesSeries} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                      <defs>
                        <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" hide />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        domain={chartDomain}
                        tickFormatter={(v: number) => (Number.isFinite(v) ? v.toFixed(2) : String(v))}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            hideIndicator
                            formatter={(value: any, name: any, item: any) => {
                              const p = item?.payload as any;
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-muted-foreground">{p?.dateStr}</div>
                                  <div className="font-mono">Δ {Number(p?.delta).toFixed(2)}</div>
                                </div>
                              );
                            }}
                          />
                        }
                      />
                      <Area type="monotone" dataKey="rating" stroke="hsl(var(--chart-1))" fill="url(#ratingFill)" strokeWidth={2} dot={{ r: 5 }} activeDot={{ r: 6 }} />
                    </AreaChart>
                  </ChartContainer>
                )}
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
                {(matches).map((m) => {
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
                  <div className="text-xs text-muted-foreground">Page {page} of {matchesTotalPages}</div>
                  <Button variant="outline" size="sm" disabled={page >= matchesTotalPages} onClick={() => setPage((p) => Math.min(matchesTotalPages, p + 1))}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


