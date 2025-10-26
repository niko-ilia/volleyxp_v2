"use client";

import { useEffect, useState } from "react";

export default function TgLoginBridgePage() {
  const [status, setStatus] = useState("Authorizing...");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const params: Record<string, string> = {};
        // query params
        url.searchParams.forEach((v, k) => { params[k] = v; });
        // hash params (oauth.telegram.org часто кладёт сюда)
        try {
          const h = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
          const hp = new URLSearchParams(h);
          hp.forEach((v, k) => { params[k] = v; });
        } catch {}
        // Some providers return tgAuthResult as JSON string or base64(JSON)
        function parsePayload(p: Record<string, string>): any {
          const raw = p.user || p.tgAuthResult || '';
          if (raw) {
            // 1) try direct JSON
            try { return JSON.parse(raw); } catch {}
            // 2) try base64 (url-safe) -> JSON
            try {
              const norm = raw.replace(/-/g, '+').replace(/_/g, '/');
              const decoded = typeof atob === 'function' ? atob(norm) : Buffer.from(norm, 'base64').toString('utf-8');
              return JSON.parse(decoded);
            } catch {}
          }
          // 3) fallback: collect known fields from params
          const keys = ['id','first_name','last_name','username','photo_url','auth_date','hash'];
          const obj: any = {};
          for (const k of keys) if (p[k]) obj[k] = p[k];
          return obj;
        }
        const telegramAuthPayload = parsePayload(params);
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


