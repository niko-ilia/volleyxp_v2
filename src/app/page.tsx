"use client";
import Hero from "@/components/site/Hero";
import HowItWorks from "@/components/site/HowItWorks";
import MatchesPreview from "@/components/site/MatchesPreview";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Avoid SSR/rehydration flashing by rendering only after mount
  if (!mounted) return null;
  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-10 w-40 animate-pulse rounded bg-muted" />
      </main>
    );
  }
  if (!user) {
    return (
      <main>
        <Hero />
        <HowItWorks />
        <MatchesPreview mockOnly title="What a match looks like" />
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold">Find or create a match!</h1>
        <p className="mt-2 text-muted-foreground">Beach volleyball — simple and convenient!</p>
        <Button asChild className="mt-6">
          <Link href="/create-match">+ Create match</Link>
        </Button>
      </section>
      <section className="mt-10">
        <MatchesPreview fallbackToMock={false} />
      </section>
    </main>
  );
}
