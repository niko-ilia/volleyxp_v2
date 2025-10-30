"use client";

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CoachDashboardPage() {
  const { user } = useAuth();
  const coachName = useMemo(() => user?.name || user?.email || "Coach", [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Coach Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Personal dashboard for: {coachName}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ближайшие сессии</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Здесь появятся ближайшие тренировки и занятия.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Игроки</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Здесь будет список ваших игроков и быстрые действия.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Заметки тренера</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Черновики, планы, напоминания — скоро добавим.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Аналитика</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Показатели прогресса игроков и эффективности тренировок — по ТЗ.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


