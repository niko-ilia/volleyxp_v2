import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.formData().catch(async () => {
      try { return await req.json(); } catch { return null; }
    });
    const origin = req.nextUrl.origin;
    // The widget posts a form to data-auth-url; forward payload to backend link endpoint
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || origin;
    const json: any = {};
    if (body instanceof FormData) {
      body.forEach((v, k) => { (json as any)[k] = v; });
    } else if (body && typeof body === 'object') {
      Object.assign(json, body);
    }
    // Fallback: raw search params
    if (!Object.keys(json).length) {
      req.nextUrl.searchParams.forEach((v, k) => { (json as any)[k] = v; });
    }
    // Build payload format compatible with our backend controller
    const telegramAuthPayload = json.user ? JSON.parse(json.user as string) : json;
    const res = await fetch(`${apiBase}/api/auth/link-telegram-authed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramAuthPayload, telegramUser: telegramAuthPayload }),
      // cookies are not needed; backend uses JWT in body-less? We rely on cookie/headers from proxy origin if same-origin
    });
    const text = await res.text();
    const n = NextResponse.json({ ok: res.ok, status: res.status, body: safeParse(text) });
    return n;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'tg-bridge error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || origin;
    const params: any = {};
    req.nextUrl.searchParams.forEach((v, k) => { params[k] = v; });
    const telegramAuthPayload = params.user ? JSON.parse(params.user as string) : params;
    const res = await fetch(`${apiBase}/api/auth/link-telegram-authed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramAuthPayload, telegramUser: telegramAuthPayload }),
    });
    const text = await res.text();
    return NextResponse.json({ ok: res.ok, status: res.status, body: safeParse(text) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'tg-bridge error' }, { status: 500 });
  }
}

function safeParse(t: string) {
  try { return JSON.parse(t); } catch { return t; }
}


