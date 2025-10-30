"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [guardReady, setGuardReady] = useState(false);

  useEffect(() => {
    let done = false;
    (async () => {
      if (!done) await refreshUser().catch(() => void 0);
      if (!done) setGuardReady(true);
    })();
    return () => { done = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roles = useMemo(() => {
    const rs = Array.isArray(user?.roles) && (user?.roles?.length || 0) > 0 ? user?.roles : (user?.role ? [user.role] : []);
    return rs || [];
  }, [user]);

  const canViewCoach = roles.includes("coach") || roles.includes("super_admin");

  useEffect(() => {
    if (guardReady && !loading && user && !canViewCoach) {
      router.replace("/");
    }
  }, [guardReady, loading, user, canViewCoach, router, pathname]);

  if (loading || !guardReady) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  if (!user || !canViewCoach) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Доступ запрещён</h1>
        <p className="text-sm text-muted-foreground">Эта страница доступна только тренерам.</p>
        <Link className="underline" href="/">На главную</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {children}
    </div>
  );
}


