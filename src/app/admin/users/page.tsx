"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

type UserItem = {
  _id: string;
  name: string;
  email: string;
  telegramUsername?: string | null;
  telegramId?: number | string | null;
  roles?: string[];
  role?: string;
  isBlocked?: boolean;
  rating?: number;
  createdAt?: string;
  lastLoginAt?: string | null;
};

type UsersResp = {
  items: UserItem[];
  users?: UserItem[];
  total: number;
  totalPages: number;
  currentPage: number;
};

export default function UsersPage() {
  const { user } = useAuth();
  const canMutate = useMemo(() => {
    const rs = Array.isArray(user?.roles) && user?.roles?.length ? user?.roles : (user?.role ? [user.role] : []);
    return rs?.includes("super_admin");
  }, [user]);

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string | "all">("all");
  const [status, setStatus] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const LIMIT = 20;
  const [data, setData] = useState<UsersResp | null>(null);
  const [loading, setLoading] = useState(true);

  const [infoUser, setInfoUser] = useState<UserItem | null>(null);
  const [editUser, setEditUser] = useState<UserItem | null>(null);

  async function load() {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("limit", String(LIMIT));
    if (search) q.set("search", search);
    if (role !== "all") q.append("role", role);
    if (status !== "all") q.set("isBlocked", status === "blocked" ? "true" : "false");
    const res = await authFetchWithRetry(`/api/admin/users?${q.toString()}`);
    if (res.ok) {
      const j = await res.json();
      setData(j);
    }
    setLoading(false);
  }

  // Debounced auto-load on filters/page changes to avoid spamming API while typing
  useEffect(() => {
    const id = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, role, status]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input placeholder="Поиск по имени/email" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={role} onValueChange={v => setRole(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Роль" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все роли</SelectItem>
            <SelectItem value="player">Игрок</SelectItem>
            <SelectItem value="court_admin">Админ корта</SelectItem>
            <SelectItem value="admin_view">Admin View</SelectItem>
            <SelectItem value="super_admin">Супер‑админ</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={v => setStatus(v as any)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активен</SelectItem>
            <SelectItem value="blocked">Заблокирован</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => { setPage(1); load(); }}>Применить</Button>
        <div className="flex-1" />
        <Button variant="secondary" onClick={async () => {
          const r = await authFetchWithRetry('/api/admin/export/users');
          if (!r.ok) return;
          const j = await r.json();
          const blob = new Blob([JSON.stringify(j.data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = j.filename || 'users.json';
          a.click();
        }}>Экспорт</Button>
      </div>

      <div className="text-xs text-muted-foreground">Показано {Math.min(data?.total || 0, page * LIMIT)} из {data?.total || 0} пользователей</div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Роли</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Рейтинг</TableHead>
              <TableHead>Последний вход</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items || data?.users || []).map(u => {
              const roles = (u.roles && u.roles.length ? u.roles : (u.role ? [u.role] : [])).join(", ");
              return (
                <TableRow key={u._id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.telegramUsername ? `@${u.telegramUsername}` : (u.telegramId ? `ID: ${u.telegramId}` : '—')}</TableCell>
                  <TableCell className="whitespace-nowrap">{roles}</TableCell>
                  <TableCell>
                    {u.isBlocked ? <Badge variant="destructive">Заблокирован</Badge> : <Badge variant="secondary">Активен</Badge>}
                  </TableCell>
                  <TableCell>{u.rating?.toFixed ? u.rating.toFixed(2) : (u.rating ?? "—")}</TableCell>
                  <TableCell>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Никогда'}</TableCell>
                  <TableCell className="text-right">
                    {canMutate ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setInfoUser(u)}>Инфо</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditUser(u)}>Изменить</Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setInfoUser(u)}>Инфо</Button>
                        <span className="text-xs text-muted-foreground">read‑only</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Pagination */}
      <Pagination className="mt-4">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }} />
          </PaginationItem>
          {Array.from({ length: Math.min(7, Math.max(1, (data?.totalPages || 1))) }, (_, i) => {
            const totalPages = data?.totalPages || 1;
            // Windowed pages around current
            const pages: number[] = [];
            const start = Math.max(1, page - 2);
            const end = Math.min(totalPages, start + 4);
            for (let p = start; p <= end; p++) pages.push(p);
            return pages.map(p => (
              <PaginationItem key={p}>
                <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); setPage(p); }}>{p}</PaginationLink>
              </PaginationItem>
            ));
          })[0]}
          <PaginationItem>
            <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage(p => Math.min(data?.totalPages || 1, p + 1)); }} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      <InfoModal user={infoUser} onClose={() => setInfoUser(null)} />
      <EditModal user={editUser} onClose={(changed?: boolean) => { setEditUser(null); if (changed) load(); }} canMutate={canMutate} />
    </div>
  );
}

function InfoModal({ user, onClose }: { user: UserItem | null; onClose: () => void }) {
  const [stats, setStats] = useState<any | null>(null);
  const [userHash, setUserHash] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    authFetchWithRetry(`/api/admin/users/${user._id}/stats`).then(async r => {
      if (r.ok) setStats(await r.json()); else setStats(null);
    });
    // Получаем хэш пользователя (если бэкенд отдаёт)
    authFetchWithRetry(`/api/admin/users/${user._id}`).then(async r => {
      if (!r.ok) return;
      const j = await r.json();
      const h = j?.hash || j?.userHash || j?.idHash || null;
      if (h) setUserHash(String(h));
    }).catch(()=>void 0);
  }, [user]);
  return (
    <Dialog open={!!user} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Информация о пользователе</DialogTitle></DialogHeader>
        {!user ? null : (
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-semibold">Основная информация:</div>
              <div>Имя: {user.name}</div>
              <div>Email: {user.email}</div>
              <div>Рейтинг: {user.rating?.toFixed ? user.rating.toFixed(2) : (user.rating ?? '—')}</div>
              <div>Дата регистрации: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</div>
              {userHash && (
                <div>Hash: <code className="font-mono text-xs break-all">{userHash}</code></div>
              )}
            </div>
            {stats && (
              <div className="space-y-2">
                <div className="font-semibold">Статистика:</div>
                <div>Создано матчей: {stats.matchesCreated}</div>
                <div>Участвовал в матчах: {stats.matchesParticipated}</div>
                <div>Подтвержденных результатов: {stats.resultsConfirmed}</div>
                <div>Записей в истории рейтинга: {stats.ratingHistory}</div>
                <div className="mt-2 font-semibold">Индивидуально по геймам:</div>
                <div>Сыграно геймов: {stats.gamesPlayed}</div>
                <div>Побед: {stats.wins}</div>
                <div>Поражений: {stats.losses}</div>
                <div>% побед: {stats.winPercent}</div>
                <div className="mt-3 font-semibold">Личные встречи:</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Оппонент</TableHead>
                      <TableHead>Игры</TableHead>
                      <TableHead>Счёт</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stats.headToHead || []).map((h: any) => (
                      <TableRow key={h.opponentId}>
                        <TableCell>
                          <div>{h.name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{h.email}</div>
                        </TableCell>
                        <TableCell>{h.games}</TableCell>
                        <TableCell>{h.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditModal({ user, onClose, canMutate }: { user: UserItem | null; onClose: (changed?: boolean) => void; canMutate: boolean }) {
  const [roles, setRoles] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!user) return;
    const rs = (user.roles && user.roles.length ? user.roles : (user.role ? [user.role] : []));
    setRoles(rs);
    setNotes("");
  }, [user]);

  if (!user) return null;

  const toggleRole = (r: string) => setRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);

  async function save() {
    if (!user) return;
    const body: Record<string, unknown> = { roles, notes };
    const r = await authFetchWithRetry(`/api/admin/users/${user._id}/role`, { method: 'PUT', body: JSON.stringify(body) });
    onClose(r.ok);
  }
  async function block() {
    if (!user) return;
    const r = await authFetchWithRetry(`/api/admin/users/${user._id}/block`, { method: 'POST', body: JSON.stringify({ reason: 'manual' }) });
    onClose(r.ok);
  }
  async function unblock() {
    if (!user) return;
    const r = await authFetchWithRetry(`/api/admin/users/${user._id}/unblock`, { method: 'POST' });
    onClose(r.ok);
  }
  async function del() {
    if (!user) return;
    const r = await authFetchWithRetry(`/api/admin/users/${user._id}`, { method: 'DELETE' });
    onClose(r.ok);
  }

  const ro = !canMutate;

  return (
    <Dialog open={!!user} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Редактировать пользователя</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">{user.name} · {user.email}</div>
          <div className="space-y-2">
            <Label>Роли</Label>
            <div className="flex flex-wrap gap-2">
              {['player','court_admin','admin_view','super_admin'].map(r => (
                <Button key={r} type="button" variant={roles.includes(r) ? 'default' : 'outline'} size="sm" disabled={ro} onClick={() => toggleRole(r)}>
                  {r === 'player' ? 'Игрок' : r === 'court_admin' ? 'Админ корта' : r === 'admin_view' ? 'Админ (только просмотр)' : 'Супер‑админ'}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Заметки</Label>
            <Textarea placeholder="Административные заметки..." value={notes} onChange={e => setNotes(e.target.value)} disabled={ro} />
          </div>

          <div className="flex flex-wrap gap-2">
            {!user.isBlocked ? (
              <Button variant="secondary" onClick={block} disabled={ro}>Заблокировать</Button>
            ) : (
              <Button variant="secondary" onClick={unblock} disabled={ro}>Разблокировать</Button>
            )}
            <Button variant="destructive" onClick={del} disabled={ro}>Удалить</Button>
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => onClose(false)}>Отмена</Button>
            <Button onClick={save} disabled={ro}>Сохранить</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


