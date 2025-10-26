import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth/api";
import { saveAuth } from "@/lib/auth/storage";
import { useRouter } from "next/navigation";

type Props = {
  className?: string;
};

export default function SSOButtons({ className }: Props) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "";
  const router = useRouter();
  const [isTgMiniApp, setIsTgMiniApp] = useState(false);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const TG_BOT = (process.env.NEXT_PUBLIC_TG_BOT_USERNAME as string) || (process.env.NEXT_PUBLIC_TG_BOT_NAME as string) || "";
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

  // Render Telegram Login Widget when NOT in Mini App and bot username is configured
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
      script.setAttribute('data-onauth', 'onTelegramAuth');
      script.setAttribute('data-request-access', 'write');
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
        router.push("/");
        return;
      }
      // Outside of Mini App — do nothing
      alert("Open this in Telegram Mini App to log in.");
    } catch (e) {
      console.error(e);
      alert("Telegram auth error");
    }
  }, [router]);

  return (
    <div className={className}>
      <Button variant="outline" className="w-full gap-3" asChild>
        <a href={`${apiBase}/api/auth/google`}>
          <Image src="/google.svg" alt="Google" width={20} height={20} />
          Continue with Google
        </a>
      </Button>
      {isTgMiniApp ? (
        <>
          <div className="h-2" />
          <Button variant="outline" className="w-full gap-3" onClick={startTelegram}>
            <Image src="/telegram.png" alt="Telegram" width={20} height={20} />
            Continue with Telegram
          </Button>
        </>
      ) : (
        TG_BOT ? (
          <>
            {hostMsg ? (
              <div className="mt-2 text-xs text-muted-foreground">{hostMsg}</div>
            ) : null}
            <div className="mt-2 flex w-full justify-center" ref={widgetRef} />
          </>
        ) : null
      )}
    </div>
  );
}



