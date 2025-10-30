import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { apiFetch, authFetchWithRetry } from "@/lib/auth/api";
import Link from "next/link";

type MatchCard = {
  id: string;
  title: string;
  datetime: string;
  place: string;
  participants: string[];
  placesLeft: number;
};

export default function MatchesPreview({ mockOnly = false, title, fallbackToMock = true }: { mockOnly?: boolean; title?: string; fallbackToMock?: boolean }) {
  const [items, setItems] = useState<MatchCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mockOnly) return; // no network for landing mock
    let cancelled = false;
    (async () => {
      try {
        // Try authenticated endpoint first to include user's private matches
        let res = await authFetchWithRetry("/api/matches?future=1");
        if (res.status === 401) {
          // Not authenticated: fall back to public listing
          res = await apiFetch("/api/matches/public?future=1");
        }
        if (!res.ok) throw new Error("Failed to load matches");
        const data = await res.json();
        if (cancelled) return;
        const mapped: MatchCard[] = (Array.isArray(data) ? data : []).map((m: any) => ({
          id: String(m._id || m.id || `${m.title}-${m.startDateTime}`),
          title: m.title,
          datetime: new Date(m.startDateTime).toLocaleString(),
          place: m.place,
          participants: (m.participants || []).map((p: any) => p.name || p.email || "Player"),
          placesLeft: Math.max(0, (m.maxParticipants ?? 0) - (m.participants?.length ?? 0)),
        }));
        setItems(mapped);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Error");
      }
    })();
    return () => { cancelled = true; };
  }, [mockOnly]);

  const header = title ?? (mockOnly ? "What a match looks like" : "Upcoming matches");

  const mock: MatchCard[] = [
    {
      id: "mock-1",
      title: "Morning beach run",
      datetime: new Date().toLocaleString(),
      place: "Municipal court",
      participants: ["Alex", "Mia", "Liam"],
      placesLeft: 2,
    },
    {
      id: "mock-2",
      title: "Evening volley",
      datetime: new Date(Date.now() + 86400000).toLocaleString(),
      place: "Poseidonia",
      participants: ["David", "Ethan"],
      placesLeft: 4,
    },
    {
      id: "mock-3",
      title: "Lunch quick set",
      datetime: new Date(Date.now() + 2 * 86400000).toLocaleString(),
      place: "Municipal court",
      participants: ["Ava"],
      placesLeft: 5,
    }
  ];

  const show = mockOnly
    ? mock
    : (items && items.length > 0)
      ? items
      : fallbackToMock
        ? mock
        : [];

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="text-center text-2xl font-semibold mb-6">{header}</h2>
      {error ? (
        <p className="text-center text-sm text-destructive">{error}</p>
      ) : show.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">No upcoming matches yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
           {show.map((m) => (
            <div key={m.id} className="block h-full">
              <Link href={`/match/${m.id}`} className="block h-full">
                <Card className="transition hover:shadow-md h-full flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-lg">{m.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">{m.datetime}</p>
                    <p className="text-sm text-muted-foreground">{m.place}</p>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="flex flex-wrap gap-2">
                      {m.participants.length ? (
                        m.participants.map((p) => <Badge key={p}>{p}</Badge>)
                      ) : (
                        <p className="text-sm text-muted-foreground">No participants</p>
                      )}
                    </div>
                    <p className="mt-auto pt-3 text-sm">Places left: {m.placesLeft}</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}




