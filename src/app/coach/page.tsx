"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetchWithRetry } from "@/lib/auth/api";
import Link from "next/link";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  // allowed creators block moved to settings page
  // Calendar & stats
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [trainings, setTrainings] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);

  //

  function monthRange(y: number, m: number) {
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  useEffect(() => {
    const { from, to } = monthRange(year, month);
    (async () => {
      try {
        const [listRes] = await Promise.all([
          authFetchWithRetry(`/api/coach/trainings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&pageSize=500`)
        ]);
        if (listRes.ok) {
          const j = await listRes.json();
          setTrainings(Array.isArray(j?.items) ? j.items : []);
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

  //
  // removed manual save — auto-save on Allow/Remove

  return (
    <div className="space-y-6">
      
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
                  <div key={i} className={`min-h-20 rounded border p-1 ${inMonth ? '' : 'opacity-40'} overflow-hidden`}>
                    <div className="text-[10px] text-muted-foreground text-right">{inMonth ? dayNum : ''}</div>
                    <div className="space-y-1">
                      {list.slice(0,3).map((t: any) => {
                        const d = new Date(t.startDateTime);
                        const tm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return (
                          <Link
                            key={t._id}
                            href={`/match/${t._id}`}
                            className="block w-full relative rounded bg-primary/10 ring-1 ring-primary/20 px-1 pr-5 py-0.5 text-[11px] hover:bg-primary/15"
                          >
                            <span className="font-medium">{tm}</span>
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/25 text-[10px] leading-none">
                              {t.participantsCount}
                            </span>
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
      </div>

      
    </div>
  );
}


