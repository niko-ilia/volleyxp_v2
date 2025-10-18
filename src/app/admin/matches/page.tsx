"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";

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

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

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
                      <Button size="sm" variant="destructive" onClick={async () => {
                        const r = await authFetchWithRetry(`/api/admin/matches/${m._id}`, { method: "DELETE" });
                        if (r.ok) load();
                      }}>Удалить</Button>
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


