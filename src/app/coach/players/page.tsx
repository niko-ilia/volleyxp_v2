"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authFetchWithRetry } from "@/lib/auth/api";

type Row = { _id: string; name?: string; email?: string; last30: number; last90: number };

export default function CoachPlayersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function maskEmail(email?: string) {
    if (!email) return "";
    try {
      const [name, domain] = email.split("@");
      if (!domain) return email;
      const visible = name.length <= 2 ? name[0] : name.slice(0, 2);
      return `${visible}***@${domain}`;
    } catch { return email; }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetchWithRetry(`/api/coach/players-stats`);
        if (!res.ok) throw new Error(String(res.status));
        const j = await res.json();
        if (!cancelled) setRows(Array.isArray(j?.items) ? j.items : []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const total = useMemo(() => {
    const r = rows || [];
    return { last30: r.reduce((s, x) => s + x.last30, 0), last90: r.reduce((s, x) => s + x.last90, 0) };
  }, [rows]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Players</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Last 30 days</TableHead>
                  <TableHead className="text-right">Last 90 days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!rows ? (
                  <TableRow><TableCell className="text-xs text-muted-foreground" colSpan={3}>{error || 'Loading…'}</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell className="text-xs text-muted-foreground" colSpan={3}>No data</TableCell></TableRow>
                ) : (
                  rows.map(r => (
                    <TableRow key={r._id}>
                      <TableCell>
                        <div className="font-medium">{r.name || maskEmail(r.email) || r._id}</div>
                        {r.email && <div className="text-xs text-muted-foreground">{maskEmail(r.email)}</div>}
                      </TableCell>
                      <TableCell className="text-right">{r.last30}</TableCell>
                      <TableCell className="text-right">{r.last90}</TableCell>
                    </TableRow>
                  ))
                )}
                {!!rows && rows.length > 0 && (
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell className="text-right font-semibold">{total.last30}</TableCell>
                    <TableCell className="text-right font-semibold">{total.last90}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


