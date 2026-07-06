import { createSignal } from "solid-js";
import { registerSW } from "virtual:pwa-register";

/**
 * Silent service-worker updates. The SW (registerType "prompt") holds a new
 * version back instead of auto-reloading; we DON'T nag with a toast. Instead a
 * new version flips the reactive `updateReady` flag — consumers show a quiet
 * badge (BottomNav profile dot) + an "Update verfügbar" row in the profile.
 * The page only swaps versions when the user chooses to (applyUpdate), since a
 * running page can't hot-swap its own code without a reload.
 *
 * Registration lives at module scope (imported once from App.tsx), so it runs
 * app-wide — not tied to a component. A double onNeedRefresh is harmless now:
 * setting the flag true twice is idempotent (this also fixes the old
 * double-toast). The signal lives outside a root, like pwa-install.ts — fine
 * for an app-lifetime singleton.
 *
 * Why an SPA needs the checks: client-side navigation never re-checks the SW,
 * so an open tab would sit on the old version. We force checks on a 30-min
 * interval and on tab re-focus; registration.update() also bypasses the
 * browser's 24h SW-cache heuristic.
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

const [updateReady, setUpdateReady] = createSignal(false);
export { updateReady };

/** True from the moment applyUpdate() is tapped until the page actually
 *  reloads (up to ~3s via the backstop) — the swap has no inherent visual,
 *  so consumers show a spinner off this flag or the tap reads as a dead
 *  no-op. Never reset: every path out of applyUpdate ends in a reload. */
const [updating, setUpdating] = createSignal(false);
export { updating };

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let reg: ServiceWorkerRegistration | undefined;

if (typeof window !== "undefined") {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setUpdateReady(true); // silent — flag it, no toast
    },
    onRegisteredSW(_swUrl, r) {
      reg = r;
      if (r) window.setInterval(() => void r.update(), CHECK_INTERVAL_MS);
    },
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void reg?.update();
  });
}

/**
 * Swap in the waiting version and reload. Posts SKIP_WAITING to the waiting SW
 * (confirmed handler in the generated sw.js), reloads on controllerchange, and
 * force-reloads after 3s as a backstop so the action is never a dead no-op even
 * in a mixed/null-controller state.
 */
export async function applyUpdate(): Promise<void> {
  setUpdating(true);
  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }
  const r =
    reg ?? (await navigator.serviceWorker.getRegistration()) ?? undefined;
  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, {
    once: true,
  });
  if (r?.waiting) r.waiting.postMessage({ type: "SKIP_WAITING" });
  else if (updateSW) void updateSW(true);
  window.setTimeout(reloadOnce, 3000);
}
