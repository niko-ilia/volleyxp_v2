"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type MatchItem = {
  _id: string;
  title?: string;
  place?: string;
  status: string;
  isPrivate?: boolean;
  startDateTime?: string;
};

type MatchesResp = {
  matches: MatchItem[];
  total: number;
  totalPages: number;
  currentPage: number;
};

export default function MatchesPage() {
  const { user } = useAuth();
  const canMutate = useMemo(() => {
    const rs = Array.isArray(user?.roles) && user?.roles?.length ? user?.roles : (user?.role ? [user.role] : []);
    return rs?.includes("super_admin");
  }, [user]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MatchesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("limit", "20");
    if (search) q.set("search", search);
    if (status !== "all") q.set("status", status);
    const res = await authFetchWithRetry(`/api/admin/matches?${q.toString()}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }

  // Debounced auto-load on filters/page changes to avoid spamming while typing
  useEffect(() => {
    const id = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, status]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input placeholder="Поиск по названию/описанию" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={status} onValueChange={v => setStatus(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой</SelectItem>
            <SelectItem value="upcoming">Запланирован</SelectItem>
            <SelectItem value="finished">Завершён</SelectItem>
            <SelectItem value="cancelled">Отменён</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => { setPage(1); load(); }}>Применить</Button>
        {canMutate && (
          <Button variant="secondary" disabled={exporting} onClick={async () => {
            setExporting(true);
            try {
              const res = await authFetchWithRetry('/api/results');
              if (!res.ok) { alert(`Export failed: ${res.status}`); return; }
              const items: any[] = await res.json();
              const header = [
                'matchId','title','place','startDateTime','confirmed','confirmedAt','gameIndex','team1_p1','team1_p2','team1Score','team2_p1','team2_p2','team2Score'
              ];
              const escape = (v: any) => {
                const s = (v ?? '').toString();
                if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
                return s;
              };
              const lines: string[] = [header.join(',')];
              for (const r of (items || [])) {
                const m = r?.match || {};
                const participants: any[] = Array.isArray(m?.participants) ? m.participants : [];
                const idToName = new Map<string, string>();
                for (const p of participants) { const pid = p?._id || p?.id; if (pid) idToName.set(String(pid), p?.name || p?.email || String(pid)); }
                const games: any[] = Array.isArray(r?.games) ? r.games : [];
                games.forEach((g, idx) => {
                  const t1: string[] = (g?.team1 || []).map((x: any) => idToName.get(String(x)) || String(x));
                  const t2: string[] = (g?.team2 || []).map((x: any) => idToName.get(String(x)) || String(x));
                  const row = [
                    r?.match?._id || m?._id || '',
                    m?.title || '',
                    m?.place || '',
                    m?.startDateTime || '',
                    r?.isConfirmed ? '1' : '0',
                    r?.confirmedAt || '',
                    String(idx + 1),
                    t1[0] || '', t1[1] || '', String(g?.team1Score ?? ''),
                    t2[0] || '', t2[1] || '', String(g?.team2Score ?? '')
                  ];
                  lines.push(row.map(escape).join(','));
                });
                if (games.length === 0) {
                  const row = [
                    r?.match?._id || m?._id || '',
                    m?.title || '',
                    m?.place || '',
                    m?.startDateTime || '',
                    r?.isConfirmed ? '1' : '0',
                    r?.confirmedAt || '',
                    '', '', '', '', '', '', ''
                  ];
                  lines.push(row.map(escape).join(','));
                }
              }
              const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = `results_export_${new Date().toISOString().slice(0,10)}.csv`;
              document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            } catch (e: any) {
              alert(e?.message || 'Export failed');
            } finally { setExporting(false); }
          }}>Экспорт CSV</Button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Локация</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.matches || []).map(m => (
              <TableRow key={m._id}>
                <TableCell>{m.title || "—"}</TableCell>
                <TableCell>{m.place || "—"}</TableCell>
                <TableCell>{m.startDateTime ? new Date(m.startDateTime).toLocaleString() : "—"}</TableCell>
                <TableCell className="capitalize">{m.status}</TableCell>
                <TableCell className="text-right">
                  {canMutate ? (
                    <div className="flex justify-end gap-2">
                      {m.status !== "cancelled" && (
                        <Button size="sm" variant="outline" onClick={async () => {
                          const r = await authFetchWithRetry(`/api/admin/matches/${m._id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "manual" }) });
                          if (r.ok) load();
                        }}>Отменить</Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">Удалить</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить матч?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Это действие необратимо. Матч будет удалён без возможности восстановления.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => {
                              const r = await authFetchWithRetry(`/api/admin/matches/${m._id}`, { method: "DELETE" });
                              if (r.ok) load();
                            }}>Удалить</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">read‑only</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}


