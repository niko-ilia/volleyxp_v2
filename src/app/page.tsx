"use client";
import Hero from "@/components/site/Hero";
import HowItWorks from "@/components/site/HowItWorks";
import MatchesPreview from "@/components/site/MatchesPreview";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Home() {
  const { user } = useAuth();
  if (!user) {
    return (
      <main>
        <Hero />
        <HowItWorks />
        <MatchesPreview />
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold">Find or create a match!</h1>
        <p className="mt-2 text-muted-foreground">Beach volleyball — simple and convenient!</p>
        <Button className="mt-6">+ Create match</Button>
      </section>
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Upcoming matches</h2>
        <Card className="mt-4">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No matches yet. Create the first one!
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
