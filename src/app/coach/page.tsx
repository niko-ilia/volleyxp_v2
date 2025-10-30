"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authFetchWithRetry } from "@/lib/auth/api";
import Link from "next/link";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const coachName = useMemo(() => user?.name || user?.email || "Coach", [user]);
  const [allowed, setAllowed] = useState<Array<{ _id: string; name: string; email: string }>>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ _id: string; name: string; emailMasked?: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [justAllowedIds, setJustAllowedIds] = useState<string[]>([]);
  // Calendar & stats
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [trainings, setTrainings] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [stats, setStats] = useState<{ totalTrainings: number; uniquePlayers: number; avgParticipants: number; upcomingCount: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetchWithRetry('/api/coach/allowed-creators');
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setAllowed(Array.isArray(j?.items) ? j.items : []);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  function monthRange(y: number, m: number) {
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  useEffect(() => {
    const { from, to } = monthRange(year, month);
    (async () => {
      try {
        const [listRes, statsRes] = await Promise.all([
          authFetchWithRetry(`/api/coach/trainings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&pageSize=500`),
          authFetchWithRetry(`/api/coach/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        ]);
        if (listRes.ok) {
          const j = await listRes.json();
          setTrainings(Array.isArray(j?.items) ? j.items : []);
        }
        if (statsRes.ok) {
          const j2 = await statsRes.json();
          setStats({ totalTrainings: j2.totalTrainings || 0, uniquePlayers: j2.uniquePlayers || 0, avgParticipants: j2.avgParticipants || 0, upcomingCount: j2.upcomingCount || 0 });
        }
      } catch {}
    })();
  }, [year, month]);

  // Upcoming sessions not tied to selected month
  useEffect(() => {
    (async () => {
      try {
        const nowIso = new Date().toISOString();
        const res = await authFetchWithRetry(`/api/coach/trainings?from=${encodeURIComponent(nowIso)}&pageSize=200`);
        if (res.ok) {
          const j = await res.json();
          setUpcoming(Array.isArray(j?.items) ? j.items : []);
        } else {
          setUpcoming([]);
        }
      } catch { setUpcoming([]); }
    })();
  }, []);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0=Sun
  const offset = (firstWeekday + 6) % 7; // Monday=0
  const gridCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  const byDay = new Map<number, any[]>();
  for (const t of trainings) {
    const d = new Date(t.startDateTime);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const dd = d.getDate();
    const arr = byDay.get(dd) || [];
    arr.push(t);
    byDay.set(dd, arr);
  }

  async function searchUsers() {
    if (search.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await authFetchWithRetry(`/api/coach/search-users?q=${encodeURIComponent(search)}`);
      if (!r.ok) return;
      const j = await r.json();
      setResults(Array.isArray(j?.items) ? j.items : []);
    } finally { setSearching(false); }
  }

  // Debounce search
  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    const id = setTimeout(() => { void searchUsers(); }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function addAllowed(u: { _id: string; name: string; emailMasked?: string }) {
    setFeedback(null);
    if (allowed.find(x => x._id === (u as any)._id)) { setFeedback('Already allowed'); return; }
    // prevent adding self
    const myId = (user as any)?._id || (user as any)?.id;
    if (String((u as any)._id) === String(myId)) { setFeedback('You cannot allow yourself'); return; }
    setAllowed(prev => { setDirty(true); return [...prev, { _id: (u as any)._id, name: (u as any).name, email: (u as any).emailMasked || '' }]; });
    setJustAllowedIds(prev => prev.includes((u as any)._id) ? prev : [...prev, (u as any)._id]);
  }
  function removeAllowed(id: string) {
    setAllowed(prev => { setDirty(true); return prev.filter(x => x._id !== id); });
  }
  async function saveAllowed() {
    setSaving(true);
    try {
      await authFetchWithRetry('/api/coach/allowed-creators', {
        method: 'PUT',
        body: JSON.stringify({ allowedCreatorIds: allowed.map(a => a._id) })
      });
      setDirty(false);
      setFeedback('Saved'); setTimeout(() => setFeedback(null), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Coach Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Personal dashboard for: {coachName}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={() => { const d = new Date(year, month - 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}>Prev</Button>
              <div className="text-sm font-medium">{new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
              <Button size="sm" variant="outline" onClick={() => { const d = new Date(year, month + 1, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); }}>Next</Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground mb-1">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} className="text-center py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: gridCount }).map((_, i) => {
                const dayNum = i - offset + 1;
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
                const list = inMonth ? (byDay.get(dayNum) || []) : [];
                return (
                  <div key={i} className={`min-h-20 rounded border p-1 ${inMonth ? '' : 'opacity-40'}`}>
                    <div className="text-[10px] text-muted-foreground text-right">{inMonth ? dayNum : ''}</div>
                    <div className="space-y-1">
                      {list.slice(0,3).map((t: any) => {
                        const d = new Date(t.startDateTime);
                        const tm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return (
                          <Link key={t._id} href={`/match/${t._id}`} className="block rounded bg-muted px-1 py-0.5 text-[11px] hover:bg-muted/70">
                            {tm} • {t.participantsCount} ppl
                          </Link>
                        );
                      })}
                      {list.length > 3 ? <div className="text-[10px] text-muted-foreground">+{list.length - 3} more</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming sessions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {upcoming.slice(0, 8).map(t => {
              const d = new Date(t.startDateTime);
              const tm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const ds = d.toLocaleDateString();
              return (
                <Link key={t._id} href={`/match/${t._id}`} className="block rounded border p-2 mb-2 hover:bg-muted/50">
                  <div className="font-medium">{t.place || t.title}</div>
                  <div className="text-xs text-muted-foreground">{ds} • {tm} • {t.participantsCount} participants</div>
                </Link>
              );
            })}
            {upcoming.length === 0 ? <div className="text-xs text-muted-foreground">No upcoming sessions</div> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Игроки</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Здесь будет список ваших игроков и быстрые действия.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Заметки тренера</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Черновики, планы, напоминания — скоро добавим.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Analytics (month)</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {stats ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Trainings</div>
                  <div className="text-xl font-semibold">{stats.totalTrainings}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Upcoming</div>
                  <div className="text-xl font-semibold">{stats.upcomingCount}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Avg participants</div>
                  <div className="text-xl font-semibold">{stats.avgParticipants.toFixed ? stats.avgParticipants.toFixed(1) : stats.avgParticipants}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Unique players</div>
                  <div className="text-xl font-semibold">{stats.uniquePlayers}</div>
                </div>
              </div>
            ) : 'Loading…'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allowed creators for Training</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Allowed list */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">Allowed</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">{feedback}</div>
                  <Button onClick={saveAllowed} disabled={saving || !dirty}>{saving ? 'Saving...' : 'Save'}</Button>
                </div>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allowed.length === 0 ? (
                      <TableRow><TableCell className="text-xs text-muted-foreground" colSpan={2}>No allowed users</TableCell></TableRow>
                    ) : allowed.map(a => (
                      <TableRow key={a._id}>
                        <TableCell>
                          <div>{a.name || a.email}</div>
                          <div className="text-xs text-muted-foreground">{a.email}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="destructive" onClick={() => removeAllowed(a._id)}>Remove</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Right: Search and results */}
            <div>
              <div className="flex gap-2 items-center">
                <label htmlFor="coach-search" className="sr-only">Search users</label>
                <Input id="coach-search" placeholder="Search by email or name" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchUsers(); } if (e.key === 'Escape') { setSearch(''); setResults([]);} }} />
                <Button type="button" onClick={searchUsers} disabled={searching || search.trim().length < 2}>{searching ? 'Searching…' : 'Search'}</Button>
              </div>
              {results.length > 0 ? (
                <div className="mt-3 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map(r => {
                        const already = allowed.some(a => a._id === r._id) || justAllowedIds.includes(r._id);
                        return (
                          <TableRow key={r._id}>
                            <TableCell>
                              <div>{r.name || r.emailMasked}</div>
                              <div className="text-xs text-muted-foreground">{r.emailMasked}</div>
                            </TableCell>
                            <TableCell className="text-right">
                              {already ? (
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white opacity-100 disabled:opacity-100 cursor-default" disabled>
                                  Done
                                </Button>
                              ) : (
                                <Button size="sm" variant="secondary" onClick={() => addAllowed(r)}>Allow</Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (search.trim().length >= 2 && !searching ? <div className="mt-3 text-xs text-muted-foreground">No results</div> : null)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


