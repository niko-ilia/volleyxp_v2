"use client";

import { useEffect, useState } from "react";

export default function TgLoginBridgePage() {
  const [status, setStatus] = useState("Authorizing...");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const params: Record<string, string> = {};
        url.searchParams.forEach((v, k) => { params[k] = v; });
        const telegramAuthPayload = params.user ? JSON.parse(params.user) : params;
        const res = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramAuthPayload, telegramUser: telegramAuthPayload })
        });
        if (!res.ok) {
          const t = await res.text();
          setStatus(`Error: ${t || res.status}`);
          window.parent?.postMessage({ type: 'tg_login_result', ok: false, error: t || String(res.status) }, '*');
          return;
        }
        const data = await res.json();
        setStatus('Authorized');
        window.parent?.postMessage({ type: 'tg_login_result', ok: true, data }, '*');
      } catch (e: any) {
        setStatus(`Error: ${e?.message || 'unknown'}`);
        window.parent?.postMessage({ type: 'tg_login_result', ok: false, error: e?.message || 'unknown' }, '*');
      }
    })();
  }, []);

  return <div style={{ fontSize: 12, padding: 8 }}>{status}</div>;
}


