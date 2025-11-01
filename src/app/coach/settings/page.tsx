"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function CoachSettingsPage() {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<Array<{ _id: string; name: string; email: string }>>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ _id: string; name: string; emailMasked?: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [justAllowedIds, setJustAllowedIds] = useState<string[]>([]);
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(false);
  const [telegramLinked, setTelegramLinked] = useState<boolean>(false);
  const [infoOpen, setInfoOpen] = useState(false);

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

  // Load telegram link status and notify toggle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, n] = await Promise.all([
          authFetchWithRetry('/api/users/profile'),
          authFetchWithRetry('/api/coach/notify-settings')
        ]);
        if (p.ok) {
          const pj = await p.json();
          if (!cancelled) setTelegramLinked(Boolean(pj?.telegramChannel?.linked));
        }
        if (n.ok) {
          const nj = await n.json();
          if (!cancelled) setNotifyEnabled(Boolean(nj?.notifyBeforeTraining));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    const id = setTimeout(() => { void searchUsers(); }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function addAllowed(u: { _id: string; name: string; emailMasked?: string }) {
    setFeedback(null);
    if (allowed.find(x => x._id === (u as any)._id)) { setFeedback('Already allowed'); return; }
    const myId = (user as any)?._id || (user as any)?.id;
    if (String((u as any)._id) === String(myId)) { setFeedback('You cannot allow yourself'); return; }
    const next = [...allowed, { _id: (u as any)._id, name: (u as any).name, email: (u as any).emailMasked || '' }];
    setAllowed(next);
    setSaving(true);
    try {
      await authFetchWithRetry('/api/coach/allowed-creators', { method: 'PUT', body: JSON.stringify({ allowedCreatorIds: next.map(a => a._id) }) });
      setFeedback('Saved'); setTimeout(() => setFeedback(null), 1200);
    } catch { setFeedback('Save failed'); }
    finally { setSaving(false); }
    setJustAllowedIds(prev => prev.includes((u as any)._id) ? prev : [...prev, (u as any)._id]);
  }

  async function removeAllowed(id: string) {
    const next = allowed.filter(x => x._id !== id);
    setAllowed(next);
    setSaving(true);
    try {
      await authFetchWithRetry('/api/coach/allowed-creators', { method: 'PUT', body: JSON.stringify({ allowedCreatorIds: next.map(a => a._id) }) });
      setFeedback('Saved'); setTimeout(() => setFeedback(null), 1200);
    } catch { setFeedback('Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div className="w-full md:w-1/2 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <Switch
              id="notify-toggle"
              checked={notifyEnabled}
              onCheckedChange={async (v) => {
                if (v && !telegramLinked) { setInfoOpen(true); return; }
                setNotifyEnabled(Boolean(v));
                try {
                  await authFetchWithRetry('/api/coach/notify-settings', { method: 'PUT', body: JSON.stringify({ notifyBeforeTraining: Boolean(v) }) });
                } catch {}
              }}
            />
            <label htmlFor="notify-toggle" className="cursor-pointer">Включить уведомление перед тренировкой</label>
          </div>
          <div className="text-xs text-muted-foreground">Включает отправку уведомлений в Telegram о предстоящих тренировках.</div>
        </CardContent>
      </Card>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Привяжите Telegram</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Чтобы включить уведомления, привяжите Telegram аккаунт в профиле (`/profile`).
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Allowed creators for Training</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      <Button size="sm" variant="destructive" disabled={saving} onClick={() => removeAllowed(a._id)}>Remove</Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={2}>
                    <div className="flex gap-2 items-center">
                      <label htmlFor="coach-search" className="sr-only">Search users</label>
                      <Input id="coach-search" placeholder="Search by email or name" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchUsers(); } if (e.key === 'Escape') { setSearch(''); setResults([]);} }} />
                      <Button type="button" onClick={searchUsers} disabled={searching || search.trim().length < 2}>{searching ? 'Searching…' : 'Search'}</Button>
                    </div>
                  </TableCell>
                </TableRow>
                {results.map(r => {
                  const already = allowed.some(a => a._id === r._id) || justAllowedIds.includes(r._id);
                  return (
                    <TableRow key={`res-${r._id}`}>
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
                          <Button size="sm" variant="secondary" disabled={saving} onClick={() => addAllowed(r)}>Allow</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="text-xs text-muted-foreground">{feedback}</div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}


