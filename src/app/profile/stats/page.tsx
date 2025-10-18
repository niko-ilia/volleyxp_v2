"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type Row = { name: string; email?: string; wins: number; losses: number; games: number };

export default function ProfileStatsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [rowsTeam, setRowsTeam] = React.useState<Row[]>([]);
  const [rowsOpp, setRowsOpp] = React.useState<Row[]>([]);
  const [page1, setPage1] = React.useState(1);
  const [page2, setPage2] = React.useState(1);
  const PAGE = 10;

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        // naive stub: fetch recent matches and aggregate client-side.
        const res = await authFetchWithRetry(`/api/users/match-history`);
        if (!res.ok) return;
        const items: any[] = await res.json();
        if (cancelled) return;

        const myId = user._id || (user as any).id;
        const teamMap = new Map<string, Row>();
        const oppMap = new Map<string, Row>();

        for (const m of items) {
          const me = myId;
          const team1: any[] = Array.isArray(m?.participants) ? m.participants : [];
          // participants shape is from controller; we already have wins/draws/losses per entry in profile history
          const myWin = (m?.wins ?? 0) > (m?.losses ?? 0) ? 1 : 0; // simple placeholder; real derivation requires per-game

          for (const p of team1) {
            const pid = p.id || p._id;
            if (!pid || pid === me) continue;
            const bucket = Math.random() > 0.5 ? teamMap : oppMap; // placeholder split; real split requires team info
            const key = pid;
            const row = bucket.get(key) || { name: p.name || p.email, email: p.email, wins: 0, losses: 0, games: 0 };
            row.games += 1;
            if (myWin) row.wins += 1; else row.losses += 1;
            bucket.set(key, row);
          }
        }
        setRowsTeam(Array.from(teamMap.values()).sort((a,b)=> (b.wins-a.wins)||(a.losses-b.losses)));
        setRowsOpp(Array.from(oppMap.values()).sort((a,b)=> (b.wins-a.wins)||(a.losses-b.losses)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user]);

  const slice = (arr: Row[], page: number) => arr.slice((page-1)*PAGE, page*PAGE);
  const totalPages = (arr: Row[]) => Math.max(1, Math.ceil(arr.length / PAGE));

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Teammates performance</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (<div className="h-8 w-full animate-pulse rounded bg-muted" />) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Wins</TableHead>
                    <TableHead className="text-right">Losses</TableHead>
                    <TableHead className="text-right">Games</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice(rowsTeam, page1).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name || r.email}</TableCell>
                      <TableCell className="text-right">{r.wins}</TableCell>
                      <TableCell className="text-right">{r.losses}</TableCell>
                      <TableCell className="text-right">{r.games}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <div>Page {page1} of {totalPages(rowsTeam)}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page1===1} onClick={()=>setPage1(p=>Math.max(1,p-1))}>Back</Button>
                  <Button size="sm" variant="outline" disabled={page1>=totalPages(rowsTeam)} onClick={()=>setPage1(p=>Math.min(totalPages(rowsTeam),p+1))}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Opponents performance</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (<div className="h-8 w-full animate-pulse rounded bg-muted" />) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">Wins</TableHead>
                    <TableHead className="text-right">Losses</TableHead>
                    <TableHead className="text-right">Games</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice(rowsOpp, page2).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name || r.email}</TableCell>
                      <TableCell className="text-right">{r.wins}</TableCell>
                      <TableCell className="text-right">{r.losses}</TableCell>
                      <TableCell className="text-right">{r.games}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <div>Page {page2} of {totalPages(rowsOpp)}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page2===1} onClick={()=>setPage2(p=>Math.max(1,p-1))}>Back</Button>
                  <Button size="sm" variant="outline" disabled={page2>=totalPages(rowsOpp)} onClick={()=>setPage2(p=>Math.min(totalPages(rowsOpp),p+1))}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


