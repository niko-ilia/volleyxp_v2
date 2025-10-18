"use client";

import { useEffect, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { DatePicker } from "@/components/ui/date-picker";

type CourtRef = { _id: string; name: string; courtsCount?: number };
type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type WorkingHoursMap = Record<DayKey, { open: string; close: string }>;
type Reservation = { _id: string; startDateTime: string; endDateTime: string; forUserId?: { name?: string; email?: string } | null; note?: string; _source?: string };
type ScheduleRes = { court: { _id: string; name: string; courtsCount: number; workingHours?: WorkingHoursMap }; reservations: Reservation[] };

export default function CourtManagerPage() {
  const { user, refreshUser } = useAuth();
  const roles = Array.isArray(user?.roles) && user?.roles?.length ? user!.roles! : (user?.role ? [user.role] : []);
  const canView = roles.includes("super_admin") || roles.includes("court_admin");

  const [courts, setCourts] = useState<CourtRef[]>([]);
  const [courtId, setCourtId] = useState<string>("");
  const [from, setFrom] = useState<string>(() => new Date(new Date().setHours(0,0,0,0)).toISOString());
  const [to, setTo] = useState<string>(() => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString());
  const [schedule, setSchedule] = useState<ScheduleRes | null>(null);
  const [creating, setCreating] = useState<{ date: string; time: string; durationMin: number; note: string; userSearch: string; pick: { _id: string } | null }>({ date: "", time: "00:00", durationMin: 60, note: "", userSearch: "", pick: null });

  async function loadCourts() {
    const path = roles.includes("super_admin") ? "/api/admin/courts" : "/api/admin/courts/mine";
    const r = await authFetchWithRetry(`${path}?limit=100`);
    if (!r.ok) return;
    const j = await r.json();
    const courtsArr = Array.isArray(j?.courts) ? j.courts : [];
    const items = courtsArr.map((c: { _id: string; name: string; courtsCount?: number }) => ({ _id: c._id, name: c.name, courtsCount: c.courtsCount }));
    setCourts(items);
    if (items[0]) setCourtId(items[0]._id);
  }

  async function loadSchedule(id = courtId) {
    if (!id) return;
    const params = new URLSearchParams({ from, to });
    const r = await authFetchWithRetry(`/api/admin/courts/${id}/schedule?${params.toString()}`);
    if (r.ok) setSchedule(await r.json());
  }

  // Ensure we have fresh roles so access check works after promoting user (only once)
  useEffect(() => { let done=false; (async()=>{ if(!done) await refreshUser().catch(()=>void 0); })(); return ()=>{done=true}; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (canView) loadCourts(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canView]);
  useEffect(() => { if (courtId) loadSchedule(courtId); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courtId]);

  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Доступ только для супер‑админа и админа корта</div>;

  const daySlots = buildDaySlots(schedule?.court?.workingHours);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Управление кортами (админ корта)</h1>
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={courtId} onValueChange={setCourtId}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Корт" /></SelectTrigger>
          <SelectContent>
            {courts.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <DatePicker value={new Date(from)} onChange={(d) => setFrom((d ?? new Date()).toISOString())} />
        <DatePicker value={new Date(to)} onChange={(d) => setTo((d ?? new Date()).toISOString())} />
        <Button onClick={() => loadSchedule()}>Обновить</Button>
      </div>

      <div>
        <div className="text-sm text-muted-foreground mb-2">Календарь</div>
        <CalendarGrid courtsCount={schedule?.court?.courtsCount || 1} slots={daySlots} reservations={schedule?.reservations || []} />
      </div>

      {/* Create reservation */}
      <div className="space-y-2">
        <div className="font-medium">Создать резервацию</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div className="grid gap-1"><Label>Дата</Label><Input placeholder="dd.mm.yyyy" value={creating.date} onChange={e => setCreating({ ...creating, date: e.target.value })} /></div>
          <div className="grid gap-1"><Label>Start time</Label><Input type="time" value={creating.time} onChange={e => setCreating({ ...creating, time: e.target.value })} /></div>
          <div className="grid gap-1"><Label>Duration</Label>
            <Select value={String(creating.durationMin)} onValueChange={(v) => setCreating({ ...creating, durationMin: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="90">1.5 hours</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1"><Label>Заметка</Label><Input value={creating.note} onChange={e => setCreating({ ...creating, note: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
          <div className="grid gap-1">
            <Label>Назначить на пользователя (поиск)</Label>
            <Input placeholder="Search players by name or email..." value={creating.userSearch} onChange={e => setCreating({ ...creating, userSearch: e.target.value })} onBlur={pickFirstUser} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={createReservation}>Создать</Button>
          </div>
        </div>
      </div>

      {/* Existing reservations list */}
      <div>
        <div className="font-medium">Резервации</div>
        <div className="text-xs text-muted-foreground">{(schedule?.reservations || []).map(r => (
          <div key={r._id} className="flex items-center justify-between border rounded p-2 my-1">
            <div>{fmt(r.startDateTime)} — {fmt(r.endDateTime)} · {r.forUserId?.name} ({r.forUserId?.email}) · {r._source === 'match' ? 'Системный (матч)' : (r.note || '—')}</div>
            {r._source === 'match' ? null : (
              <Button size="sm" variant="destructive" onClick={() => delReservation(r._id)}>Удалить</Button>
            )}
          </div>
        ))}</div>
      </div>
    </div>
  );

  async function pickFirstUser() {
    if (!creating.userSearch || creating.pick) return;
    const r = await authFetchWithRetry(`/api/users/search?q=${encodeURIComponent(creating.userSearch)}`);
    if (r.ok) {
      const arr = await r.json();
      setCreating(c => ({ ...c, pick: arr[0] || null }));
    }
  }

  async function createReservation() {
    if (!courtId || !creating.date) return;
    const [hh, mm] = creating.time.split(":");
    const start = parseLocal(creating.date, Number(hh), Number(mm));
    const end = new Date(start.getTime() + creating.durationMin * 60000);
    const body: Record<string, unknown> = { startDateTime: start.toISOString(), endDateTime: end.toISOString(), note: creating.note };
    if (creating.pick?._id) body.forUserId = creating.pick._id;
    const r = await authFetchWithRetry(`/api/admin/courts/${courtId}/reservations`, { method: 'POST', body: JSON.stringify(body) });
    if (r.ok) { await loadSchedule(); setCreating({ date: "", time: "00:00", durationMin: 60, note: "", userSearch: "", pick: null }); }
  }

  async function delReservation(id: string) {
    const r = await authFetchWithRetry(`/api/admin/courts/${courtId}/reservations/${id}`, { method: 'DELETE' });
    if (r.ok) loadSchedule();
  }
}

function buildDaySlots(working?: WorkingHoursMap) {
  const open = working?.monday?.open || "07"; const close = working?.monday?.close || "23";
  const startHour = Number(open); const endHour = Number(close);
  const hours = [] as string[];
  for (let h = startHour; h <= endHour; h++) hours.push(String(h).padStart(2, '0') + ":00");
  return hours;
}

function CalendarGrid({ courtsCount, slots, reservations }: { courtsCount: number; slots: string[]; reservations: Reservation[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 border rounded overflow-hidden">
      {[0,1].map((dayIdx) => (
        <div key={dayIdx} className="min-h-[480px]">
          <div className="border-b px-2 py-1 text-xs text-muted-foreground">{labelDay(dayIdx)}</div>
          {slots.map(t => (
            <div key={t} className="border-b h-10 text-xs px-2 flex items-center justify-between">
              <span>{t}</span>
              <span className="text-[10px] text-muted-foreground">Площадок: {courtsCount}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function labelDay(offset: number) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseLocal(dateStr: string, hh: number, mm: number) {
  // dateStr expected dd.mm.yyyy
  const parts = dateStr.includes('.') ? dateStr.split('.') : dateStr.split('-').reverse();
  const [dd, mo, yyyy] = parts.map(Number);
  const d = new Date(Date.UTC(yyyy, mo - 1, dd, hh, mm));
  // Convert to local time preserving wall time
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
}

function fmt(s?: string) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString();
}


