"use client";

import React from "react";
import Link from "next/link";
import { Volleyball } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, logout, loading, refreshUser } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);
  // Refresh profile once right after login/mount, avoid loops on user change
  const didRefreshRef = React.useRef(false);
  React.useEffect(() => {
    if (!user || didRefreshRef.current) return;
    didRefreshRef.current = true;
    refreshUser().catch(() => void 0);
  }, [user, refreshUser]);
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Volleyball className="h-5 w-5" />
          </span>
          <span>VolleyXP</span>
        </Link>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                EN
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="flex items-center gap-2">
                EN
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!mounted ? (
            <div className="h-8 w-24" />
          ) : loading ? (
            <div className="h-8 w-24 animate-pulse rounded bg-muted" />
          ) : user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="shadow">
                    {user.name || user.email}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem asChild>
                    <Link href="/profile">Profile</Link>
                  </DropdownMenuItem>
                  {(() => {
                    const roles = Array.isArray((user as any).roles) && (user as any).roles.length
                      ? (user as any).roles
                      : ((user as any).role ? [(user as any).role] : []);
                    const canAdmin = roles.includes('super_admin') || roles.includes('admin_view');
                    return canAdmin ? (
                      <DropdownMenuItem asChild>
                        <Link href="/admin">Admin panel</Link>
                      </DropdownMenuItem>
                    ) : null;
                  })()}
                  {(() => {
                    const roles = Array.isArray((user as any).roles) && (user as any).roles.length
                      ? (user as any).roles
                      : ((user as any).role ? [(user as any).role] : []);
                    return roles.includes('coach') ? (
                      <DropdownMenuItem asChild>
                        <Link href="/coach">Coach Dashboard</Link>
                      </DropdownMenuItem>
                    ) : null;
                  })()}
                  <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild size="sm" className="shadow">
                <Link href="/register">Register</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}




