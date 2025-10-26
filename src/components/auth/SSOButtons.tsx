import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth/api";
import { saveAuth } from "@/lib/auth/storage";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

type Props = {
  className?: string;
};

export default function SSOButtons({ className }: Props) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "";
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [isTgMiniApp, setIsTgMiniApp] = useState(false);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const TG_BOT = (process.env.NEXT_PUBLIC_TG_BOT_USERNAME as string) || (process.env.NEXT_PUBLIC_TG_BOT_NAME as string) || "";
  const TG_BOT_ID = (process.env.NEXT_PUBLIC_TG_BOT_ID as string) || ""; // optional, for direct OAuth URL fallback
  const [canRenderWidget, setCanRenderWidget] = useState(false);
  const [hostMsg, setHostMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const wa = (typeof window !== 'undefined' && (window as any).Telegram && (window as any).Telegram.WebApp)
        ? (window as any).Telegram.WebApp
        : null;
      if (wa && wa.initData) {
        setIsTgMiniApp(true);
      }
      // Enable widget only on HTTPS public domains (Telegram requirement)
      if (typeof window !== 'undefined') {
        const isHttps = window.location.protocol === 'https:';
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        setCanRenderWidget(isHttps && !isLocal);
        if (!isHttps || isLocal) setHostMsg('Telegram Login Widget requires an HTTPS public domain whitelisted in BotFather (/setdomain).');
      }
    } catch {}
  }, []);

  // Listen bridge messages (data-auth-url fallback)
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (!e?.data) return;
      if (e.data.type === 'tg_login_result' && e.data.data) {
        try {
          const d = e.data.data;
          if (d?.token && d?.user) {
            saveAuth(d.token, d.refreshToken ?? null, d.user);
            try { await refreshUser(); } catch {}
            router.push('/');
          }
        } catch {}
      }
    };
    try { window.addEventListener('message', onMsg); } catch {}
    return () => { try { window.removeEventListener('message', onMsg); } catch {} };
  }, [router]);

  // Render Telegram Login Widget (hidden) when NOT in Mini App and bot username is configured
  useEffect(() => {
    if (isTgMiniApp || !TG_BOT || !canRenderWidget) return;
    try {
      const w: any = typeof window !== 'undefined' ? window : {};
      w.onTelegramAuth = async (user: any) => {
        try {
          const res = await apiFetch("/api/auth/telegram", {
            method: "POST",
            body: JSON.stringify({ telegramAuthPayload: user, telegramUser: user }),
            headers: { "Content-Type": "application/json" },
          });
          if (!res.ok) throw new Error(`TG auth failed: ${res.status}`);
          const data = await res.json();
          saveAuth(data.token, data.refreshToken ?? null, data.user);
          try { await refreshUser(); } catch {}
          router.push("/");
        } catch (e) {
          console.error(e);
          alert("Telegram auth failed");
        }
      };
      // inject script
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.setAttribute('data-telegram-login', TG_BOT);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-userpic', 'false');
      // Some browsers require explicit function signature string
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      try {
        const origin = window.location.origin;
        script.setAttribute('data-auth-url', `${origin}/auth/tg-login-bridge`);
      } catch {}
      const holder = widgetRef.current;
      if (holder) {
        holder.innerHTML = '';
        holder.appendChild(script);
      }
      return () => {
        try { if (holder) holder.innerHTML = ''; } catch {}
        try { delete (w as any).onTelegramAuth; } catch {}
      };
    } catch {}
  }, [isTgMiniApp, TG_BOT, canRenderWidget, router]);

  const startTelegram = useCallback(async () => {
    try {
      // Prefer Telegram WebApp if available
      const wa = (typeof window !== 'undefined' && (window as any).Telegram && (window as any).Telegram.WebApp) ? (window as any).Telegram.WebApp : null;
      if (wa && wa.initDataUnsafe && wa.initData) {
        const initData = wa.initData as string; // raw init data string
        const tgUser = wa.initDataUnsafe?.user || null;
        const res = await apiFetch("/api/auth/telegram", {
          method: "POST",
          body: JSON.stringify({ telegramInitData: initData, telegramUser: tgUser }),
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(`TG auth failed: ${res.status}`);
        const data = await res.json();
        saveAuth(data.token, data.refreshToken ?? null, data.user);
        try { await refreshUser(); } catch {}
        router.push("/");
        return;
      }
      // Web: trigger hidden widget programmatically
      const w: any = typeof window !== 'undefined' ? window : {};
      if (w?.TWidgetLogin && typeof w.TWidgetLogin.auth === 'function') {
        try { w.TWidgetLogin.auth(); return; } catch {}
      }
      try {
        const btn = widgetRef.current?.querySelector('button') as HTMLButtonElement | null;
        btn?.click();
        return;
      } catch {}
      // Direct OAuth fallback via oauth.telegram.org (requires bot_id)
      try {
        if (TG_BOT_ID) {
          const origin = window.location.origin;
          const returnTo = encodeURIComponent(`${origin}/auth/tg-login-bridge`);
          const oauth = `https://oauth.telegram.org/auth?bot_id=${encodeURIComponent(TG_BOT_ID)}&origin=${encodeURIComponent(origin)}&embed=1&request_access=write&return_to=${returnTo}`;
          // Navigate the current tab (avoids popup blockers)
          window.location.assign(oauth);
          return;
        }
      } catch {}
      // Dev/localhost fallback: open bot link so user can start the bot (and use Mini App)
      if (TG_BOT) {
        try { window.open(`https://t.me/${TG_BOT}`, '_blank', 'noopener'); } catch {}
      }
      alert(hostMsg || "Telegram login requires HTTPS and a whitelisted domain. Open the bot or use the Mini App.");
    } catch (e) {
      console.error(e);
      alert("Telegram auth error");
    }
  }, [router, TG_BOT, TG_BOT_ID, hostMsg]);

  // Precompute direct OAuth URL if available (most reliable on prod)
  let oauthUrl: string | null = null;
  try {
    if (typeof window !== 'undefined' && TG_BOT_ID) {
      const origin = window.location.origin;
      const returnTo = encodeURIComponent(`${origin}/auth/tg-login-bridge`);
      oauthUrl = `https://oauth.telegram.org/auth?bot_id=${encodeURIComponent(TG_BOT_ID)}&origin=${encodeURIComponent(origin)}&embed=1&request_access=write&return_to=${returnTo}`;
    }
  } catch {}

  return (
    <div className={className}>
      <Button variant="outline" className="w-full gap-3" asChild>
        <a href={`${apiBase}/api/auth/google`}>
          <Image src="/google.svg" alt="Google" width={20} height={20} />
          Continue with Google
        </a>
      </Button>
      <div className="h-2" />
      {oauthUrl ? (
        <Button variant="outline" className="w-full gap-3" asChild>
          <a href={oauthUrl}>
            <Image src="/telegram.png" alt="Telegram" width={20} height={20} />
            Continue with Telegram
          </a>
        </Button>
      ) : (
        <>
          <Button variant="outline" className="w-full gap-3" onClick={startTelegram}>
            <Image src="/telegram.png" alt="Telegram" width={20} height={20} />
            Continue with Telegram
          </Button>
          {TG_BOT ? (
            <div className="sr-only" aria-hidden ref={widgetRef} />
          ) : null}
        </>
      )}
    </div>
  );
}



