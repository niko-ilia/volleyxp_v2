"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type UsersAnalytics = {
  registrationsByMonth: { _id: { year: number; month: number }; count: number }[];
  topPlayersByRating: { _id: string; name: string; email: string; rating: number }[];
  blockedUsers: number;
};

type MatchesAnalytics = {
  matchesByMonth: { _id: { year: number; month: number }; count: number }[];
  popularCourts: { _id: string; count: number }[];
  avgParticipants: number;
};

type ActivityAnalytics = { activeUsers: number; recentMatches: number; recentResults: number };

function monthLabel(y: number, m: number) {
  return `${m}/${y}`;
}

export default function AnalyticsPage() {
  const [users, setUsers] = useState<UsersAnalytics | null>(null);
  const [matches, setMatches] = useState<MatchesAnalytics | null>(null);
  const [activity, setActivity] = useState<ActivityAnalytics | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      authFetchWithRetry("/api/admin/analytics/users").then(r => r.ok ? r.json() : null),
      authFetchWithRetry("/api/admin/analytics/matches").then(r => r.ok ? r.json() : null),
      authFetchWithRetry("/api/admin/analytics/activity").then(r => r.ok ? r.json() : null),
    ]).then(([u, ma, act]) => { if (!mounted) return; setUsers(u); setMatches(ma); setActivity(act); });
    return () => { mounted = false; };
  }, []);

  const top10 = users?.topPlayersByRating ?? [];
  const topCourts = (matches?.popularCourts ?? []).slice(0, 3);
  const last4Regs = useMemo(() => {
    const arr = users?.registrationsByMonth ?? [];
    return [...arr].sort((a,b)=> a._id.year - b._id.year || a._id.month - b._id.month).slice(-4);
  }, [users]);
  const last4Matches = useMemo(() => {
    const arr = matches?.matchesByMonth ?? [];
    return [...arr].sort((a,b)=> a._id.year - b._id.year || a._id.month - b._id.month).slice(-4);
  }, [matches]);

  return (
    <div className="space-y-6">
      {/* Топ-10 пользователей */}
      <Card>
        <CardHeader><CardTitle className="text-base">Топ-10 пользователей по рейтингу</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {top10.map((u, idx) => (
            <div key={u._id || idx} className="flex items-center justify-between rounded-md border p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">#{idx + 1} {u.name || '—'}</div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
              </div>
              <Badge>{(u.rating ?? 0).toFixed(2)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Популярные корты */}
      <Card>
        <CardHeader><CardTitle className="text-base">Популярные корты</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {topCourts.map((c, i) => (
            <div key={c._id + i} className="rounded-md border p-4">
              <div className="text-sm text-muted-foreground mb-2">{c._id || '—'}</div>
              <div className="text-2xl font-semibold">{c.count}</div>
              <div className="text-xs text-muted-foreground">матчей</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Регистрации по месяцам */}
      <Card>
        <CardHeader><CardTitle className="text-base">Регистрации пользователей по месяцам</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          {last4Regs.map((r, i) => (
            <div key={`${r._id.year}-${r._id.month}-${i}`} className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">{monthLabel(r._id.year, r._id.month)}</div>
              <div className="mt-2 text-2xl font-semibold">{r.count}</div>
              <div className="text-xs text-muted-foreground">новых пользователей</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Создание матчей по месяцам */}
      <Card>
        <CardHeader><CardTitle className="text-base">Создание матчей по месяцам</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          {last4Matches.map((m, i) => (
            <div key={`${m._id.year}-${m._id.month}-${i}`} className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">{monthLabel(m._id.year, m._id.month)}</div>
              <div className="mt-2 text-2xl font-semibold">{m.count}</div>
              <div className="text-xs text-muted-foreground">матчей создано</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Общая статистика */}
      <Card>
        <CardHeader><CardTitle className="text-base">Общая статистика</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border p-4">
            <div className="text-xs text-muted-foreground">Заблокированных пользователей</div>
            <div className="mt-2 text-2xl font-semibold">{users?.blockedUsers ?? 0}</div>
          </div>
          <div className="rounded-md border p-4">
            <div className="text-xs text-muted-foreground">Среднее количество участников</div>
            <div className="mt-2 text-2xl font-semibold">{(matches?.avgParticipants ?? 0).toFixed(1)}</div>
          </div>
          <div className="rounded-md border p-4">
            <div className="text-xs text-muted-foreground">Общая активность</div>
            <div className="mt-2 text-2xl font-semibold">{activity?.activeUsers ?? 0}</div>
            <div className="text-xs text-muted-foreground">активных элементов</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


