"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Court = {
  _id: string;
  name: string;
  description?: string;
  address: string;
  status: "active" | "inactive" | "maintenance";
  isPaid: boolean;
  price?: number;
  pricesEUR?: { oneHour?: number; twoHours?: number };
  managerId?: { _id: string; name: string; email: string } | null;
  ownerId?: { _id: string; name: string; email: string } | null;
  courtsCount?: number;
  workingHours?: WorkingHoursMap;
};

type CourtsResp = { courts: Court[]; total: number; totalPages: number; currentPage: number };
type UserLite = { _id: string; name: string; email: string };

export default function CourtsPage() {
  const { user } = useAuth();
  const isSuperAdmin = useMemo(() => {
    const rs = Array.isArray(user?.roles) && user?.roles?.length ? user!.roles! : (user?.role ? [user.role] : []);
    return rs.includes("super_admin");
  }, [user]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | "all">("all");
  const [data, setData] = useState<CourtsResp | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Court | null>(null);

  async function load() {
    if (!isSuperAdmin) return; // UI доступно только супер-админу
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", "1"); q.set("limit", "50");
    if (search) q.set("search", search);
    if (status !== "all") q.set("status", status);
    const r = await authFetchWithRetry(`/api/admin/courts?${q.toString()}`);
    if (r.ok) setData(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!isSuperAdmin) {
    return <div className="text-sm text-muted-foreground">Недостаточно прав для управления кортами.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Управление кортами</h2>
        <p className="text-sm text-muted-foreground">Управляйте спортивными объектами и их менеджерами</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[220px]"><Input placeholder="Название или адрес..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Select value={status} onValueChange={v => setStatus(v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="active">Активен</SelectItem>
            <SelectItem value="inactive">Выключен</SelectItem>
            <SelectItem value="maintenance">Обслуживание</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => load()}>Сбросить</Button>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => location.assign('/court-manager')}>Перейти в управление кортами</Button>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>Добавить корт</Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Адрес</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Владелец</TableHead>
              <TableHead>Менеджер</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.courts || []).map(c => (
              <TableRow key={c._id}>
                <TableCell>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.description || c.address?.split(" ").slice(0,2).join(" ")}</div>
                </TableCell>
                <TableCell>{c.address}</TableCell>
                <TableCell>{
                  c.status === "active" ? <Badge variant="secondary">ACTIVE</Badge> : c.status === "maintenance" ? <Badge>MAINT.</Badge> : <Badge variant="outline">INACTIVE</Badge>
                }</TableCell>
                <TableCell className="whitespace-nowrap">{c.ownerId ? `${c.ownerId.name} (${c.ownerId.email})` : "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{c.managerId ? `${c.managerId.name} (${c.managerId.email})` : "—"}</TableCell>
                <TableCell>{c.isPaid ? <Badge>ПЛАТНЫЙ</Badge> : <Badge variant="secondary">БЕСПЛАТНЫЙ</Badge>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setEditing(c); setOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={async () => { const r = await authFetchWithRetry(`/api/admin/courts/${c._id}`, { method: "DELETE" }); if (r.ok) load(); }}>Удалить</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CourtModal open={open} setOpen={setOpen} editing={editing} onSaved={load} />
    </div>
  );
}

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type WorkingHoursMap = Record<DayKey, { open: string; close: string }>

function CourtModal({ open, setOpen, editing, onSaved }: { open: boolean; setOpen: (v: boolean) => void; editing: Court | null; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [address, setAddress] = useState(editing?.address || "");
  const [status, setStatus] = useState<string>(editing?.status || "active");
  const [isPaid, setIsPaid] = useState<boolean>(editing?.isPaid || false);
  const [price1h, setPrice1h] = useState<number | "">(editing?.pricesEUR?.oneHour ?? editing?.price ?? "");
  const [price2h, setPrice2h] = useState<number | "">(editing?.pricesEUR?.twoHours ?? "");
  const [courtsCount, setCourtsCount] = useState<number>(editing?.courtsCount || 1);
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");

  // working hours simple HH for open/close
  const [wh, setWh] = useState<WorkingHoursMap>(() => {
    const def = { open: "07", close: "23" };
    const defaultWH: WorkingHoursMap = {
      monday: def,
      tuesday: def,
      wednesday: def,
      thursday: def,
      friday: def,
      saturday: def,
      sunday: def,
    };
    return editing?.workingHours ?? defaultWH;
  });

  // manager/owner pickers
  const [manager, setManager] = useState<UserLite | null>(editing?.managerId || null);
  const [owner, setOwner] = useState<UserLite | null>(editing?.ownerId || null);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || "");
    setDescription(editing?.description || "");
    setAddress(editing?.address || "");
    setStatus(editing?.status || "active");
    setIsPaid(editing?.isPaid || false);
    setPrice1h(editing?.pricesEUR?.oneHour ?? editing?.price ?? "");
    setPrice2h(editing?.pricesEUR?.twoHours ?? "");
    setCourtsCount(editing?.courtsCount || 1);
    setManager(editing?.managerId || null);
    setOwner(editing?.ownerId || null);
  }, [open, editing]);

  async function save() {
    const body: Record<string, unknown> = {
      name,
      description,
      address,
      status,
      isPaid,
      courtsCount,
      workingHours: wh,
      managerId: manager?._id,
      ownerId: owner?._id,
    };
    if (isPaid) {
      if (price1h !== "") body.priceOneHourEUR = Number(price1h);
      if (price2h !== "") body.priceTwoHoursEUR = Number(price2h);
    }
    // Coordinates: required by backend when creating. For edit, omit if unchanged.
    if (!editing) {
      body.coordinates = [Number(lng) || 0, Number(lat) || 0];
    } else if (lat || lng) {
      body.coordinates = [Number(lng) || 0, Number(lat) || 0];
    }
    const url = editing ? `/api/admin/courts/${editing._id}` : "/api/admin/courts";
    const method = editing ? "PUT" : "POST";
    const r = await authFetchWithRetry(url, { method, body: JSON.stringify(body) });
    if (r.ok) { setOpen(false); onSaved(); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Редактировать корт" : "Добавить корт"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Название *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Описание</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Адрес *</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="grid gap-2">
              <Label>Статус</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Статус" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активен</SelectItem>
                  <SelectItem value="inactive">Выключен</SelectItem>
                  <SelectItem value="maintenance">Обслуживание</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Тип</Label>
              <div className="flex items-center gap-3">
                <Switch checked={isPaid} onCheckedChange={setIsPaid} />
                <span className="text-sm">{isPaid ? "Платный" : "Бесплатный"}</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Количество кортов на локации</Label>
              <Input type="number" min={1} value={courtsCount} onChange={e => setCourtsCount(Math.max(1, Number(e.target.value || 1)))} />
            </div>
          </div>

          {isPaid && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Цена 1 час (EUR)</Label>
                <Input type="number" min={0} value={price1h} onChange={e => setPrice1h(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div className="grid gap-2">
                <Label>Цена 2 часа (EUR)</Label>
                <Input type="number" min={0} value={price2h} onChange={e => setPrice2h(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <UserPicker label="Менеджер" value={manager} onChange={setManager} />
            <UserPicker label="Владелец" value={owner} onChange={setOwner} />
          </div>

          <WorkingHours value={wh} onChange={setWh} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Latitude</Label>
              <Input value={lat} onChange={e => setLat(e.target.value)} placeholder="55.75" />
            </div>
            <div className="grid gap-2">
              <Label>Longitude</Label>
              <Input value={lng} onChange={e => setLng(e.target.value)} placeholder="37.61" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={save}>{editing ? "Сохранить" : "Добавить"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkingHours({ value, onChange }: { value: WorkingHoursMap; onChange: (v: WorkingHoursMap) => void }) {
  const days = [
    { key: "monday", label: "Monday" },
    { key: "tuesday", label: "Tuesday" },
    { key: "wednesday", label: "Wednesday" },
    { key: "thursday", label: "Thursday" },
    { key: "friday", label: "Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
  ] as const;
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  return (
    <div className="grid gap-2">
      <Label>Часы работы (по дням)</Label>
      <div className="grid gap-3">
        {days.map(d => (
          <div key={d.key} className="grid grid-cols-[80px_1fr_1fr] md:grid-cols-[120px_1fr_1fr] gap-3 items-center">
            <div className="text-sm text-muted-foreground">{d.label}</div>
            <Select value={value?.[d.key]?.open || "07"} onValueChange={v => onChange({ ...value, [d.key]: { ...(value?.[d.key] || {}), open: v } })}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{hours.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={value?.[d.key]?.close || "23"} onValueChange={v => onChange({ ...value, [d.key]: { ...(value?.[d.key] || {}), close: v } })}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{hours.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserPicker({ label, value, onChange }: { label: string; value: UserLite | null; onChange: (u: UserLite | null) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserLite[]>([]);
  // Debounce + cancel-inflight to avoid spamming search endpoint while typing
  const tRef = useState<NodeJS.Timeout | null>(null)[0] as NodeJS.Timeout | null; // placeholder to satisfy type
  const timerRef = useState<{ id: any | null }>({ id: null })[0];
  const abortRef = useState<{ c: AbortController | null }>({ c: null })[0];
  function searchUsers(q: string) {
    if (timerRef.id) clearTimeout(timerRef.id);
    if (!q || q.length < 2) { setItems([]); abortRef.c?.abort(); abortRef.c = null; return; }
    timerRef.id = setTimeout(async () => {
      abortRef.c?.abort();
      const controller = new AbortController();
      abortRef.c = controller;
      try {
        const r = await authFetchWithRetry(`/api/users/search?q=${encodeURIComponent(q)}`, { signal: controller.signal } as any);
        if (r.ok) setItems(await r.json());
      } catch {}
    }, 300);
  }
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="justify-between">
            {value ? `${value.name} (${value.email})` : "Не назначен"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[320px]" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Поиск пользователя..." onValueChange={searchUsers} />
            <CommandEmpty>Ничего не найдено</CommandEmpty>
            <CommandGroup>
              {items.map(u => (
                <CommandItem key={u._id} value={u._id} onSelect={() => { onChange(u); setOpen(false); }}>
                  <div>
                    <div className="text-sm">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                </CommandItem>
              ))}
              {value && (
                <CommandItem value="__clear__" onSelect={() => { onChange(null); setOpen(false); }}>
                  Сбросить
                </CommandItem>
              )}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}



