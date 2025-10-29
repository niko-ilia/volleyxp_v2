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
        const res = await authFetchWithRetry(`/api/users/profile-stats`);
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        const teammates = Array.isArray(body?.teammates) ? body.teammates : [];
        const opponents = Array.isArray(body?.opponents) ? body.opponents : [];
        setRowsTeam(teammates.map((r: any) => ({ name: r.name || r.email || '', email: r.email, wins: Number(r.wins||0), losses: Number(r.losses||0), games: Number(r.games||0) })));
        setRowsOpp(opponents.map((r: any) => ({ name: r.name || r.email || '', email: r.email, wins: Number(r.wins||0), losses: Number(r.losses||0), games: Number(r.games||0) })));
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


