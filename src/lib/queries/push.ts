import { supabase } from "@/lib/supabase";

/**
 * Web-Push client flow (Phase 1): permission → subscribe → store in
 * push_subscriptions → send a test push via the send-push edge function.
 *
 * The VAPID PUBLIC key is safe to ship in the client (it's the application
 * server identifier); the private key lives only as a Supabase edge secret.
 *
 * Everything here needs an active service worker, so it only works in a
 * built/served context (preview / prod), not the plain dev server. The UI gates
 * on pushSupported() + a SW-ready check so a dev-server toggle can't hang.
 */

const VAPID_PUBLIC_KEY =
  "BCyreZZplhYl-z0H_a_DVKIqAiGTJTWXEwS5MH6l3lFbO2nd-fyfns2ZGnpiyc9f6EnfgINQSYtYffGdI0m6dEU";

export type PushPermission = "unsupported" | "default" | "granted" | "denied";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): PushPermission {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

/** Wait for an active SW registration, but never hang (dev server has none). */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; error: "unsupported" | "denied" | "dismissed" | "no_sw" | "store_failed" };

export async function subscribeToPush(userId: string): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, error: "unsupported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    return { ok: false, error: permission === "denied" ? "denied" : "dismissed" };

  const reg = await readyRegistration();
  if (!reg) return { ok: false, error: "no_sw" };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const { error } = await supabase
    .from("push_subscriptions")
    .insert({
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    })
    .select();

  // 23505 = this endpoint is already stored (same device re-subscribing) →
  // treat as success, the keys for an endpoint are stable.
  if (error && error.code !== "23505") return { ok: false, error: "store_failed" };
  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

export async function sendTestPush(): Promise<{ ok: boolean; sent?: number }> {
  const { data, error } = await supabase.functions.invoke("send-push", {
    body: {
      title: "Nakama",
      body: "Test-Benachrichtigung ✓ — Push läuft!",
      url: "/",
    },
  });
  if (error) return { ok: false };
  return { ok: true, sent: (data as { sent?: number } | null)?.sent };
}
