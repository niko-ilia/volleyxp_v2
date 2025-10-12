import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, UserPlus, Trophy } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    { icon: UserPlus, title: "1. Register", desc: "Create an account in a minute and get access to all features." },
    { icon: CalendarClock, title: "2. Find a match", desc: "Choose a suitable game and join a team." },
    { icon: Trophy, title: "3. Play and win", desc: "Participate, confirm results, and boost your rating!" },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="text-center text-2xl font-semibold mb-6">How does it work?</h2>
      <div className="grid gap-6 sm:grid-cols-3">
        {steps.map((s) => (
          <Card key={s.title} className="text-center">
            <CardHeader>
              <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <s.icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{s.desc}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}




