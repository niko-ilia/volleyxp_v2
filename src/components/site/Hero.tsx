import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="text-balance text-4xl sm:text-5xl font-bold tracking-tight">
          Find or create a match!
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Beach volleyball — simple and convenient!
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg" className="shadow">
            <Link href="/register">Create Account</Link>
          </Button>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-sky-100 via-white to-white" />
    </section>
  );
}




