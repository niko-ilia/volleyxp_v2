"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";

function monthRange(y: number, m: number) {
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function CoachStatsPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [rows, setRows] = useState<Array<{ weekLabel: string; trainings: number; uniquePlayers: number; players: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [presetDays, setPresetDays] = useState<number | null>(null);

  function startOfWeek(d: Date) {
    const nd = new Date(d); const day = (nd.getDay()+6)%7; nd.setDate(nd.getDate()-day); nd.setHours(0,0,0,0); return nd;
  }
  function endOfWeek(d: Date) { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999); return e; }

  async function loadTable(rangeFromIso: string, rangeToIso: string) {
    setLoading(true);
    try {
      const res = await authFetchWithRetry(`/api/coach/trainings?from=${encodeURIComponent(rangeFromIso)}&to=${encodeURIComponent(rangeToIso)}&pageSize=1000`);
      if (!res.ok) { setRows([]); return; }
      const j = await res.json();
      const items = Array.isArray(j?.items) ? j.items : [];
      const map = new Map<string, { trainings: number; uniqueSet: Set<string>; players: number; label: string }>();
      for (const it of items) {
        const d = new Date(it.startDateTime);
        const ws = startOfWeek(d); const we = endOfWeek(d);
        const key = ws.toISOString().slice(0,10);
        const label = `${ws.toLocaleDateString()} - ${we.toLocaleDateString()}`;
        if (!map.has(key)) map.set(key, { trainings: 0, uniqueSet: new Set<string>(), players: 0, label });
        const rec = map.get(key)!;
        rec.trainings += 1;
        const cnt = Number(it?.participantsCount || (Array.isArray(it?.participants)? it.participants.length: 0));
        rec.players += cnt;
        const ids: string[] = Array.isArray(it?.participants) ? it.participants.map((x:any)=>String(x)) : [];
        ids.forEach(id => rec.uniqueSet.add(id));
      }
      const arr = Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0])).map(([_,v])=>({ weekLabel: v.label, trainings: v.trainings, uniquePlayers: v.uniqueSet.size, players: v.players }));
      setRows(arr);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const r = monthRange(year, month);
    loadTable(r.from, r.to);
  }, [year, month]);

  const appliedFromIso = useMemo(() => {
    const d = range?.from ? new Date(range.from) : new Date(); d.setHours(0,0,0,0); return d.toISOString();
  }, [range]);
  const appliedToIso = useMemo(() => {
    const d = range?.to ? new Date(range.to) : new Date(); d.setHours(23,59,59,999); return d.toISOString();
  }, [range]);

  function applyPreset(days: number) {
    setPresetDays(days);
    const to = new Date(); to.setHours(23,59,59,999);
    const from = new Date(); from.setDate(from.getDate() - (days - 1)); from.setHours(0,0,0,0);
    setRange({ from, to });
    loadTable(from.toISOString(), to.toISOString());
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Статистика</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={(r) => { setRange(r); setPresetDays(null); }} className="w-[320px]" />
            <div className="flex items-center gap-2">
              <Button size="sm" variant={presetDays === 30 ? "secondary" : "outline"} className="rounded-full" onClick={() => applyPreset(30)}>Last 30 days</Button>
              <Button size="sm" variant={presetDays === 14 ? "secondary" : "outline"} className="rounded-full" onClick={() => applyPreset(14)}>Last 14 days</Button>
              <Button size="sm" variant={presetDays === 7 ? "secondary" : "outline"} className="rounded-full" onClick={() => applyPreset(7)}>Last 7 days</Button>
            </div>
            <Button size="sm" onClick={() => { setPresetDays(null); loadTable(appliedFromIso, appliedToIso); }} disabled={loading}>Apply</Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">Trainings</TableHead>
                  <TableHead className="text-right">Unique players</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell className="text-xs text-muted-foreground" colSpan={4}>No data</TableCell></TableRow>
                ) : rows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{r.weekLabel}</TableCell>
                    <TableCell className="text-right">{r.trainings}</TableCell>
                    <TableCell className="text-right">{r.uniquePlayers}</TableCell>
                    <TableCell className="text-right">{r.players}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


