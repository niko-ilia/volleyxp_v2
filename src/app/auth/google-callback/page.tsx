"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveAuth } from "@/lib/auth/storage";

function CallbackInner() {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const token = sp.get("token");
    const refreshToken = sp.get("refreshToken");
    const userRaw = sp.get("user");
    if (token) {
      const user = userRaw ? JSON.parse(userRaw) : { email: "", name: "" };
      saveAuth(token, refreshToken, user);
      router.replace("/");
    } else {
      router.replace("/login");
    }
  }, [sp, router]);
  return null;
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-16 text-center text-muted-foreground">Finishing Google sign-in…</div>}>
      <CallbackInner />
    </Suspense>
  );
}


