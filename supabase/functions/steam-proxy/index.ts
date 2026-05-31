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
 * → https://store.steampowered.com/api/<endpoint>/?<same query>
 *
 * Only those two endpoints are allowlisted. The Supabase gateway already
 * verifies the anon key (the client sends apikey + Authorization), so no extra
 * auth is needed here.
 *
 * Deploy (Phase 9, not done yet):
 *   npx supabase functions deploy steam-proxy --project-ref <ref>
 */

const STEAM_BASE = "https://store.steampowered.com/api";
const ALLOWED = new Set(["storesearch", "appdetails"]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const endpoint = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!ALLOWED.has(endpoint)) {
    return json({ error: "unknown endpoint" }, 404);
  }

  const target = `${STEAM_BASE}/${endpoint}/?${url.searchParams.toString()}`;
  try {
    const res = await fetch(target, { headers: { accept: "application/json" } });
    const body = await res.text();
    return new Response(body, {
      status: res.ok ? 200 : res.status,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch {
    return json({ error: "upstream fetch failed" }, 502);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
