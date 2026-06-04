/**
 * send-push — Supabase Edge Function (Deno). Phase 1 of web-push: sends a push
 * to the CALLER'S OWN subscriptions (the profile "Test-Benachrichtigung"
 * button). Phase 2 (cron sending to others on new releases) will build on this.
 *
 * SECURITY (mirrors steam-proxy):
 *   - Per-USER auth via auth.getUser() on the caller's bearer (the gateway's
 *     verify_jwt only proves *some* project JWT). The client sends the user's
 *     access_token, not the anon key.
 *   - The caller-scoped client only ever reads/deletes the caller's OWN
 *     push_subscriptions rows (RLS), so this can't fan out to other users.
 *   - CORS pinned to the ALLOWED_ORIGINS allowlist (same secret as steam-proxy).
 *
 * Body (optional JSON): { title, body, url } — defaults to a test notification.
 *
 * Deploy:
 *   npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…
 *   npx supabase functions deploy send-push --project-ref <ref>
 *   (SUPABASE_URL + SUPABASE_ANON_KEY are injected by the platform.)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@usenakama.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, cors);
  if (!VAPID_PUBLIC || !VAPID_PRIVATE)
    return json({ error: "push not configured" }, 500, cors);

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

  // Optional custom payload; default to a friendly test notification.
  let payload = { title: "Nakama", body: "Test-Benachrichtigung ✓", url: "/" };
  try {
    const raw = await req.text();
    if (raw) {
      const parsed = JSON.parse(raw);
      payload = {
        title: typeof parsed.title === "string" ? parsed.title : payload.title,
        body: typeof parsed.body === "string" ? parsed.body : payload.body,
        url: typeof parsed.url === "string" ? parsed.url : payload.url,
      };
    }
  } catch {
    /* keep defaults */
  }

  // RLS scopes this to the caller's own rows.
  const { data: subs, error: subErr } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (subErr) return json({ error: "subscription lookup failed" }, 500, cors);
  if (!subs || subs.length === 0)
    return json({ sent: 0, message: "no subscriptions" }, 200, cors);

  const body = JSON.stringify(payload);
  let sent = 0;
  const stale: string[] = [];
  await Promise.all(
    (subs as SubRow[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // 404/410 = subscription gone → drop it so it stops being retried.
        if (code === 404 || code === 410) stale.push(s.id);
      }
    }),
  );

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", stale);
  }

  return json({ sent, removed: stale.length }, 200, cors);
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
