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

  React.useEffect(() => {
    // Prefer compact user history to compute stats in one request
    let cancelled = false;
    async function loadHistory() {
      try {
        const res = await authFetchWithRetry('/api/users/match-history');
        if (!res.ok) throw new Error('Failed to load history');
        const items = await res.json();
        if (cancelled) return;
        // Build per-match stats map and overall summary (games-based) using finished items only
        const per: Record<string, { wins: number; losses: number }> = {};
        let wins = 0, losses = 0, total = 0; // wins/losses here are GAME counts
        if (Array.isArray(items)) {
          for (const it of items) {
            if (!it?.matchId) continue;
            // считаем только завершённые
            const isFinished = it?.status === 'finished' || (typeof it?.wins === 'number' || typeof it?.losses === 'number');
            if (isFinished) {
              total += 1;
              const w = Number(it?.wins ?? 0);
              const l = Number(it?.losses ?? 0);
              per[it.matchId] = { wins: w, losses: l };
              wins += w; losses += l; // aggregate by games, not matches
            }
          }
        }
        setStatsByMatchId(prev => ({ ...per, ...prev }));
        const gamesTotal = wins + losses;
        setStatsSummary({ total, wins, losses, winPct: gamesTotal ? wins / gamesTotal : 0 });
      } catch (_) {
        // ignore — fallback to per-match stats loader below
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    }
    if (user) loadHistory();
    return () => { cancelled = true; };
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
    if (historyLoaded) return; // уже получили из user history — не дёргаем per-match
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
    if (historyLoaded) return; // summary уже вычислен из history
    let cancelled = false;
    const uid = (user && (user._id || (user as any).id)) || null;
    const list = matches as any[]; // capture non-null value for TS
    async function computeSummary() {
      const finished = list.filter((m: any) => m?.status === 'finished');
      let wins = 0; let losses = 0; const total = finished.length; // wins/losses are GAME counts
      // Fetch stats for those we don't have yet and aggregate (by games)
      for (const m of finished) {
        if (!m?._id) continue;
        if (statsByMatchId[m._id]) {
          const small = statsByMatchId[m._id];
          wins += Number(small.wins ?? 0); losses += Number(small.losses ?? 0);
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
          wins += Number(me?.wins ?? 0); losses += Number(me?.losses ?? 0);
          const small = { wins: me?.wins ?? 0, losses: me?.losses ?? 0 };
          setStatsByMatchId(prev => ({ ...prev, [m._id]: prev[m._id] || small }));
        } catch {}
      }
      if (!cancelled) {
        const gamesTotal = wins + losses;
        setStatsSummary({ total, wins, losses, winPct: gamesTotal ? wins / gamesTotal : 0 });
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
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {tgChannel.title || (tgChannel.username ? `@${tgChannel.username}` : tgChannel.id)}
                  </div>
                  <Button size="icon" variant="ghost" aria-label="Unlink channel" disabled={channelBusy} onClick={async () => {
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


