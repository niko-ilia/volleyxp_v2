"use client";

import { useEffect, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Overview = {
  totalUsers: number;
  totalMatches: number;
  totalResults: number;
  activeUsers: number;
  activityDetails: { matchParticipants: number; matchCreators: number; resultConfirmers: number; loginUsers: number };
  usersByRole: { _id: string; count: number }[];
  matchesByStatus: { _id: string; count: number }[];
};

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      authFetchWithRetry("/api/admin/analytics/overview"),
    ]).then(async ([ov]) => {
      if (!mounted) return;
      if (ov.ok) {
        const j = await ov.json();
        setData(j);
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  if (!data) return <div className="text-sm text-destructive">Failed to load</div>;

  const tile = (title: string, value: number | string, right?: React.ReactNode) => (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="text-sm text-muted-foreground font-normal">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between">
        <div className="text-3xl font-semibold">{value}</div>
        {right}
      </CardContent>
    </Card>
  );

  const status = (k: string) => data.matchesByStatus.find(s => s._id === k)?.count || 0;
  const roleCount = (k: string) => data.usersByRole.find(r => r._id === k)?.count || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tile("Всего пользователей", data.totalUsers)}
        {tile("Всего матчей", data.totalMatches)}
        {tile("Активных за 30 дней", data.activeUsers)}
        {tile("Результатов матчей", data.totalResults)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Активность за последние 30 дней</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tile("Новых матчей", data.activityDetails.matchCreators)}
          {tile("Результатов матчей", data.activityDetails.resultConfirmers)}
          {tile("Активных пользователей", data.activeUsers)}
          {tile("Входили в систему", data.activityDetails.loginUsers)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Детализация активности</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tile("Участники матчей", data.activityDetails.matchParticipants)}
          {tile("Создатели матчей", data.activityDetails.matchCreators)}
          {tile("Подтверждали результаты", data.activityDetails.resultConfirmers)}
          {tile("Входили в систему", data.activityDetails.loginUsers)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Пользователи по ролям</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Badge variant="secondary">СУПЕР-АДМИН: {roleCount("super_admin")}</Badge>
          <Badge variant="secondary">АКТИВНЫЕ ИГРОКИ: {roleCount("active_player")}</Badge>
          <Badge variant="secondary">ЗАБЛОКИРОВАНЫ: {roleCount("blocked_player")}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Матчи по статусам</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Badge>ЗАПЛАНИРОВАНЫ: {status("upcoming")}</Badge>
          <Badge variant="success">ЗАВЕРШЕНЫ: {status("finished")}</Badge>
          <Badge variant="destructive">ОТМЕНЕНЫ: {status("cancelled")}</Badge>
        </CardContent>
      </Card>
    </div>
  );
}


