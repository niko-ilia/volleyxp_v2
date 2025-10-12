import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type MatchCard = {
  title: string;
  datetime: string;
  place: string;
  participants: string[];
  placesLeft: number;
};

const mock: MatchCard[] = [
  {
    title: "Evening match",
    datetime: "11/10/2025, 16:27:36",
    place: "Municipal courts (near Thalassokoritso)",
    participants: ["Alexey", "Maria", "Dmitry"],
    placesLeft: 3,
  },
  {
    title: "Morning training",
    datetime: "12/10/2025, 14:27:36",
    place: "BVB (near Poseidonia hotel)",
    participants: ["Elena", "Sergey"],
    placesLeft: 4,
  },
  {
    title: "Weekend tournament",
    datetime: "13/10/2025, 14:27:36",
    place: "Municipal courts (near Thalassokoritso)",
    participants: [],
    placesLeft: 6,
  },
];

export default function MatchesPreview() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="text-center text-2xl font-semibold mb-6">Sample upcoming matches</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {mock.map((m) => (
          <Card key={m.title}>
            <CardHeader>
              <CardTitle className="text-lg">{m.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{m.datetime}</p>
              <p className="text-sm text-muted-foreground">{m.place}</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {m.participants.length ? (
                  m.participants.map((p) => <Badge key={p}>{p}</Badge>)
                ) : (
                  <p className="text-sm text-muted-foreground">No participants</p>
                )}
              </div>
              <p className="mt-3 text-sm">Places left: {m.placesLeft}</p>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" className="w-full">Details</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}




