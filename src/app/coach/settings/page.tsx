"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CoachSettingsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Настройки тренера</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Настройки профиля тренера появятся здесь.
        </CardContent>
      </Card>
    </div>
  );
}


