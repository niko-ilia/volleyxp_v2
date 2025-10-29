"use client";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import SSOButtons from "@/components/auth/SSOButtons";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { consumeSavedNextPath, sanitizeNextPath, saveNextPath } from "@/lib/auth/next";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const { loginWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const next = sanitizeNextPath(sp?.get("next"));
      if (next) saveNextPath(next);
    } catch {}
  }, [sp]);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SSOButtons />

          <div className="relative py-2">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
              or
            </span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={async ()=>{
            setError(null);
            const ok = await loginWithPassword(email, password);
            if (!ok) {
              setError("Invalid credentials");
              return;
            }
            try {
              const next = consumeSavedNextPath();
              router.replace(next || "/");
            } catch {
              router.replace("/");
            }
          }}>Sign in</Button>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          New to VolleyXP?&nbsp;
          <Link className="text-foreground underline" href="/register">Create an account</Link>
        </CardFooter>
      </Card>
    </div>
  );
}


