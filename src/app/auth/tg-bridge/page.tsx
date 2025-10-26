"use client";

import { useEffect, useState } from "react";
import { authFetchWithRetry } from "@/lib/auth/api";

export default function TgBridgePage() {
  const [status, setStatus] = useState<string>("Linking...");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const params: Record<string, string> = {};
        url.searchParams.forEach((v, k) => { params[k] = v; });
        const telegramAuthPayload = params.user ? JSON.parse(params.user) : params;
        // 1) Try token from query
        try {
          const token = url.searchParams.get('jwt');
          if (token) {
            const res = await fetch(`/api/auth/link-telegram-authed?jwt=${encodeURIComponent(token)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ telegramAuthPayload, telegramUser: telegramAuthPayload })
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            window.parent?.postMessage({ type: 'tg_link_result', ok: true, data }, '*');
            return;
          }
        } catch {}
        // 2) Request token from parent via postMessage handshake
        const tokenFromParent: string | null = await new Promise((resolve) => {
          let done = false;
          const onMsg = (e: MessageEvent) => {
            if (e?.data?.type === 'tg_bridge_token' && typeof e.data.token === 'string') {
              done = true; window.removeEventListener('message', onMsg); resolve(e.data.token);
            }
          };
          window.addEventListener('message', onMsg);
          window.parent?.postMessage({ type: 'tg_bridge_need_token' }, '*');
          setTimeout(() => { if (!done) resolve(null); }, 1200);
        });
        if (tokenFromParent) {
          const res = await fetch(`/api/auth/link-telegram-authed?jwt=${encodeURIComponent(tokenFromParent)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramAuthPayload, telegramUser: telegramAuthPayload })
          });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          window.parent?.postMessage({ type: 'tg_link_result', ok: true, data }, '*');
          return;
        }
        const res = await authFetchWithRetry('/api/auth/link-telegram-authed', {
          method: 'POST',
          body: JSON.stringify({ telegramAuthPayload, telegramUser: telegramAuthPayload }),
          headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
          const t = await res.text();
          setStatus(`Error: ${t || res.status}`);
          window.parent?.postMessage({ type: 'tg_link_result', ok: false, error: t || String(res.status) }, '*');
          return;
        }
        const data = await res.json();
        setStatus('Linked');
        window.parent?.postMessage({ type: 'tg_link_result', ok: true, data }, '*');
      } catch (e: any) {
        setStatus(`Error: ${e?.message || 'unknown'}`);
        window.parent?.postMessage({ type: 'tg_link_result', ok: false, error: e?.message || 'unknown' }, '*');
      }
    })();
  }, []);

  return (
    <div style={{ fontSize: 12, padding: 8 }}>{status}</div>
  );
}


