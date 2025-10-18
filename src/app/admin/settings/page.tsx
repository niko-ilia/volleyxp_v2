"use client";

import { useEffect, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

type Settings = {
  maxMatchDuration: number;
  resultConfirmationHours: number;
  matchCancellationHours: number;
  maxParticipants: number;
  defaultRating: number;
  emailNotifications: boolean;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const canMutate = Array.isArray(user?.roles) ? user!.roles!.includes("super_admin") : user?.role === "super_admin";
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    authFetchWithRetry("/api/admin/settings").then(async r => {
      if (r.ok) setSettings(await r.json());
    });
  }, []);

  if (!settings) return <div className="text-sm text-muted-foreground">Loading...</div>;

  const update = (k: keyof Settings, v: any) => setSettings({ ...settings, [k]: v } as Settings);

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle className="text-base">Системные настройки</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <L label="Макс. длительность (мин)"><Input type="number" value={settings.maxMatchDuration} onChange={e => update("maxMatchDuration", Number(e.target.value))} disabled={!canMutate} /></L>
        <L label="Часы на подтверждение результата"><Input type="number" value={settings.resultConfirmationHours} onChange={e => update("resultConfirmationHours", Number(e.target.value))} disabled={!canMutate} /></L>
        <L label="Часы на отмену матча"><Input type="number" value={settings.matchCancellationHours} onChange={e => update("matchCancellationHours", Number(e.target.value))} disabled={!canMutate} /></L>
        <L label="Макс. участников"><Input type="number" value={settings.maxParticipants} onChange={e => update("maxParticipants", Number(e.target.value))} disabled={!canMutate} /></L>
        <L label="Стартовый рейтинг"><Input type="number" value={settings.defaultRating} onChange={e => update("defaultRating", Number(e.target.value))} disabled={!canMutate} /></L>
        <L label="Email уведомления"><Switch checked={settings.emailNotifications} onCheckedChange={v => update("emailNotifications", v)} disabled={!canMutate} /></L>
      </CardContent>
      <CardFooter>
        <Button disabled={!canMutate} onClick={async () => {
          await authFetchWithRetry("/api/admin/settings", { method: "PUT", body: JSON.stringify(settings) });
        }}>Сохранить</Button>
      </CardFooter>
    </Card>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:items-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}


