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
        // 1) Получаем историю матчей пользователя
        const res = await authFetchWithRetry(`/api/users/match-history`);
        if (!res.ok) return;
        const items: any[] = await res.json();
        if (cancelled) return;

        const myId = user._id || (user as any).id;
        const teamMap = new Map<string, Row>();
        const oppMap = new Map<string, Row>();

        // 2) Берём только завершённые матчи и тянем реальные stats по каждому
        const finished = (Array.isArray(items) ? items : []).filter((i: any) => i?.status === 'finished' || (typeof i?.wins === 'number' || typeof i?.losses === 'number'));
        await Promise.all(finished.map(async (it: any) => {
          const mid = it?.matchId || it?._id || it?.id;
          if (!mid) return;
          const s = await authFetchWithRetry(`/api/results/${mid}/stats`);
          if (!s.ok) return;
          const data = await s.json();
          const parts: any[] = Array.isArray(data?.item?.participants) ? data.item.participants : [];
          // Разворачиваем участников в teammates/opponents относительно меня по геймам
          // У нас уже агрегировано по игроку: wins/losses/games — этого достаточно для кумуляции
          for (const p of parts) {
            const pid = p?.userId?._id || p?.userId || p?._id || p?.id;
            if (!pid || pid === myId) continue;
            const entry: Row = { name: p?.name || p?.email || String(pid), email: p?.email, wins: Number(p?.wins||0), losses: Number(p?.losses||0), games: Number(p?.games||0) };
            // Определение teammate/opponent: если у игрока были общие геймы со мной в одной команде чаще, чем в другой — teammate.
            // Стат-эндпоинт сейчас не отдаёт явного разбиения, поэтому приближённо считаем teammate если (wins+losses) > 0 и wins > losses в тех геймах, где мы играли вместе.
            // Без точных данных о составе геймов распределим всех как opponents по умолчанию.
            const bucket = oppMap; // дообогащение возможно после расширения stats
            const map = bucket === teamMap ? teamMap : oppMap;
            const prev = map.get(pid) || { name: entry.name, email: entry.email, wins: 0, losses: 0, games: 0 };
            prev.wins += entry.wins; prev.losses += entry.losses; prev.games += entry.games;
            map.set(pid, prev);
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


