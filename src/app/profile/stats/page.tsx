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
        // 1) История матчей пользователя
        const res = await authFetchWithRetry(`/api/users/match-history`);
        if (!res.ok) return;
        const items: any[] = await res.json();
        if (cancelled) return;

        const myId = user._id || (user as any).id;
        const teamMap = new Map<string, Row>();
        const oppMap = new Map<string, Row>();

        // 2) Для завершённых матчей — берём сырой результат (с составами геймов) + участников матча
        const finished = (Array.isArray(items) ? items : []).filter((i: any) => i?.status === 'finished' || (typeof i?.wins === 'number' || typeof i?.losses === 'number'));
        await Promise.all(finished.map(async (it: any) => {
          const mid = it?.matchId || it?._id || it?.id;
          if (!mid) return;
          const [resResult, resMatch] = await Promise.all([
            authFetchWithRetry(`/api/results/${mid}`),
            authFetchWithRetry(`/api/matches/${mid}`)
          ]);
          if (!resResult.ok || !resMatch.ok) return;
          const result: any = await resResult.json();
          const match: any = await resMatch.json();
          const idToName = new Map<string, { name?: string; email?: string }>();
          (Array.isArray(match?.participants) ? match.participants : []).forEach((p: any) => {
            const pid = p?._id || p?.id; if (!pid) return; idToName.set(String(pid), { name: p?.name, email: p?.email });
          });
          const games: any[] = Array.isArray(result?.games) ? result.games : [];
          for (const g of games) {
            const team1: string[] = Array.isArray(g?.team1) ? g.team1.map((x: any) => String(x)) : [];
            const team2: string[] = Array.isArray(g?.team2) ? g.team2.map((x: any) => String(x)) : [];
            const myIn1 = team1.includes(myId);
            const myIn2 = team2.includes(myId);
            if (!myIn1 && !myIn2) continue; // не участвовал в этом гейме
            const myTeam = myIn1 ? team1 : team2;
            const oppTeam = myIn1 ? team2 : team1;
            const s1 = Number(g?.team1Score ?? 0); const s2 = Number(g?.team2Score ?? 0);
            const myWin = myIn1 ? (s1 > s2) : (s2 > s1);
            const hasWinner = s1 !== s2;
            // teammates
            for (const pid of myTeam) {
              if (pid === myId) continue;
              const nm = idToName.get(pid) || {};
              const row = teamMap.get(pid) || { name: nm.name || nm.email || pid, email: nm.email, wins: 0, losses: 0, games: 0 };
              row.games += 1; if (hasWinner) { if (myWin) row.wins += 1; else row.losses += 1; }
              teamMap.set(pid, row);
            }
            // opponents
            for (const pid of oppTeam) {
              const nm = idToName.get(pid) || {};
              const row = oppMap.get(pid) || { name: nm.name || nm.email || pid, email: nm.email, wins: 0, losses: 0, games: 0 };
              row.games += 1; if (hasWinner) { if (myWin) row.wins += 1; else row.losses += 1; }
              oppMap.set(pid, row);
            }
          }
        }));

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


