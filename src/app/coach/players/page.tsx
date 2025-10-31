"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CoachPlayersPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Игроки</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Список игроков и инструменты управления появятся здесь.
        </CardContent>
      </Card>
    </div>
  );
}


