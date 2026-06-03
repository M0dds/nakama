/**
 * steam-proxy — Supabase Edge Function (Deno).
 *
 * Steam's store endpoints block CORS, so the browser can't call them directly.
 * In dev we use a Vite proxy (vite.config.ts); in production this function
 * forwards the same two endpoints and adds CORS headers so the SPA can read
 * the response.
 *
 * Routes (mirrors src/lib/steam.ts → steamApiUrl):
 *   GET /steam-proxy/storesearch?term=…&l=german&cc=DE
 *   GET /steam-proxy/appdetails?appids=…&l=german&cc=DE
 * → https://store.steampowered.com/api/<endpoint>/?<allowlisted query>
 *
 * SECURITY (hardened 2026-06-04, SEC-DEPLOY / security audit L-2 + I-3):
 *   - Per-USER auth: the gateway's verify_jwt only proves the bearer is *some*
 *     valid project JWT — the public anon key counts. So we additionally call
 *     auth.getUser() with the caller's Authorization header and 401 unless it
 *     resolves to a real signed-in user. The client (steam.ts) must therefore
 *     send the user's access_token as the bearer, NOT the anon key.
 *   - CORS is pinned to an allowlist (ALLOWED_ORIGINS secret), not '*', so only
 *     our own SPA origins can read the response from a browser.
 *   - Only `storesearch` / `appdetails` are allowlisted, on a hardcoded host,
 *     and only the params each endpoint needs are forwarded (no open relay,
 *     no arbitrary-host SSRF).
 *
 * Deploy (Phase 9):
 *   npx supabase secrets set ALLOWED_ORIGINS="https://nakama.example,https://www.nakama.example"
 *   npx supabase functions deploy steam-proxy --project-ref <ref>
 *   (SUPABASE_URL + SUPABASE_ANON_KEY are injected by the platform.)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const STEAM_BASE = "https://store.steampowered.com/api";

// Per-endpoint param allowlist — only forward what each endpoint actually uses,
// rather than passing the whole query string through to Steam.
const ALLOWED: Record<string, Set<string>> = {
  storesearch: new Set(["term", "l", "cc"]),
  appdetails: new Set(["appids", "l", "cc"]),
};

// Origins permitted to read the response cross-origin. Set via the
// ALLOWED_ORIGINS secret (comma-separated) at deploy. Empty = deny all (safe
// default — the app stays blocked until the secret is configured).
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** CORS headers for this request — reflects the Origin only if allowlisted, so
 *  an un-listed site gets no Access-Control-Allow-Origin and the browser blocks
 *  the read. `Vary: Origin` keeps caches from cross-contaminating origins. */
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsFor(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405, cors);
  }

  // Require a real signed-in user — not just a valid project JWT (the anon key
  // is one). getUser() validates the caller's bearer against the auth server.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "unauthorized" }, 401, cors);
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "unauthorized" }, 401, cors);

  const url = new URL(req.url);
  const endpoint = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const allowedParams = ALLOWED[endpoint];
  if (!allowedParams) return json({ error: "unknown endpoint" }, 404, cors);

  // Rebuild the query from only the allowlisted params (drops anything else a
  // caller tries to smuggle through to Steam).
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (allowedParams.has(k)) out.set(k, v);
  }

  const target = `${STEAM_BASE}/${endpoint}/?${out.toString()}`;
  try {
    const res = await fetch(target, { headers: { accept: "application/json" } });
    const body = await res.text();
    return new Response(body, {
      status: res.ok ? 200 : res.status,
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch {
    return json({ error: "upstream fetch failed" }, 502, cors);
  }
});

function json(
  payload: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
