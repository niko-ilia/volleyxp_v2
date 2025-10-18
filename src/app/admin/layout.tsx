"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, refreshUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Ensure we have fresh roles for guarding
    refreshUser().catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roles = useMemo(() => {
    const rs = Array.isArray(user?.roles) && (user?.roles?.length || 0) > 0 ? user?.roles : (user?.role ? [user.role] : []);
    return rs || [];
  }, [user]);

  const canViewAdmin = roles.includes("super_admin") || roles.includes("admin_view");

  useEffect(() => {
    if (!loading && user && !canViewAdmin) {
      router.replace("/");
    }
  }, [loading, user, canViewAdmin, router]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading...</div>
    );
  }

  if (!user || !canViewAdmin) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Доступ запрещён</h1>
        <p className="text-sm text-muted-foreground">У вас нет прав для просмотра административной панели.</p>
        <Link className="underline" href="/">На главную</Link>
      </div>
    );
  }

  const tabs = [
    { href: "/admin/overview", value: "overview", label: "Обзор" },
    { href: "/admin/users", value: "users", label: "Пользователи" },
    { href: "/admin/matches", value: "matches", label: "Матчи" },
    { href: "/admin/courts", value: "courts", label: "Корты" },
    { href: "/admin/analytics", value: "analytics", label: "Аналитика" },
    { href: "/admin/settings", value: "settings", label: "Настройки" },
  ] as const;

  const active = tabs.find(t => pathname?.startsWith(t.href))?.value ?? "overview";

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-3xl font-bold tracking-tight mb-4">Административная панель</h1>
      <Tabs value={active} className="w-full">
        <TabsList className="grid grid-cols-6 w-full">
          {tabs.map(t => (
            <TabsTrigger key={t.value} value={t.value} asChild>
              <Link href={t.href} className={cn("w-full text-center")}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="mt-6">
        {children}
      </div>
    </div>
  );
}


