"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authFetchWithRetry } from "@/lib/auth/api";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const coachName = useMemo(() => user?.name || user?.email || "Coach", [user]);
  const [allowed, setAllowed] = useState<Array<{ _id: string; name: string; email: string }>>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ _id: string; name: string; email: string }>>([]);
  const [saving, setSaving] = useState(false);

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

  async function searchUsers() {
    try {
      const r = await authFetchWithRetry(`/api/coach/search-users?q=${encodeURIComponent(search)}`);
      if (!r.ok) return;
      const j = await r.json();
      setResults(Array.isArray(j?.items) ? j.items : []);
    } catch {}
  }

  function addAllowed(u: { _id: string; name: string; email: string }) {
    setAllowed(prev => prev.find(x => x._id === u._id) ? prev : [...prev, u]);
  }
  function removeAllowed(id: string) {
    setAllowed(prev => prev.filter(x => x._id !== id));
  }
  async function saveAllowed() {
    setSaving(true);
    try {
      await authFetchWithRetry('/api/coach/allowed-creators', {
        method: 'PUT',
        body: JSON.stringify({ allowedCreatorIds: allowed.map(a => a._id) })
      });
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
            <CardTitle>Ближайшие сессии</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Здесь появятся ближайшие тренировки и занятия.
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
            <CardTitle>Аналитика</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Показатели прогресса игроков и эффективности тренировок — по ТЗ.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allowed creators for Training</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Search by email or name" value={search} onChange={e => setSearch(e.target.value)} />
            <Button type="button" onClick={searchUsers}>Search</Button>
          </div>
          {results.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(r => (
                    <TableRow key={r._id}>
                      <TableCell>
                        <div>{r.name || r.email}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="secondary" onClick={() => addAllowed(r)}>Allow</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Allowed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allowed.map(a => (
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
          <div className="flex justify-end">
            <Button onClick={saveAllowed} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


