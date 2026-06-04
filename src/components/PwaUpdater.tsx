import { onCleanup, onMount } from "solid-js";
import { registerSW } from "virtual:pwa-register";
import { RefreshCw } from "lucide-solid";
import { useToast } from "@/lib/toast";

/**
 * Service-worker update prompt. Registers the SW (registerType "prompt", so a
 * new SW waits) and, when one is ready, raises a sticky toast — the user taps
 * "Neu laden" to swap in the new version. Controlled alternative to autoUpdate's
 * silent reload (no losing a half-typed note to a surprise reload).
 *
 * The "Neu laden" handler is EXPLICIT rather than relying on the plugin's
 * updateSW(true): we post {type:"SKIP_WAITING"} straight to the waiting worker
 * (confirmed handler in the generated sw.js), reload on `controllerchange`
 * (fires once the new SW claims the page → it now serves the fresh assets), and
 * keep a timeout backstop so the click is never a dead no-op even in a mixed
 * controller state (e.g. after a manual hard reload left an older SW in charge).
 * The controllerchange listener is attached PER CLICK (not on mount) so the
 * first-install clientsClaim can't trigger a spurious reload.
 *
 * Why an SPA needs the checks: client-side navigation never re-checks the SW,
 * so an open tab would sit on the old version. We force checks on a 30-min
 * interval and on tab re-focus; registration.update() also bypasses the
 * browser's 24h SW-cache heuristic.
 *
 * Must render under the ToastProvider (AppShell). Renders nothing.
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const RELOAD_BACKSTOP_MS = 3000;

export function PwaUpdater() {
  const toast = useToast();

  onMount(() => {
    if (!("serviceWorker" in navigator)) return;
    let reg: ServiceWorkerRegistration | undefined;
    let interval: number | undefined;

    // Take over with the waiting SW, then reload onto its fresh assets.
    const applyUpdate = async () => {
      const r =
        reg ?? (await navigator.serviceWorker.getRegistration()) ?? undefined;
      let reloaded = false;
      const reloadOnce = () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      };
      // The new SW claims the page on activation → controllerchange → reload.
      navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, {
        once: true,
      });
      if (r?.waiting) {
        r.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        // No waiting worker in scope (odd state) — let the plugin try.
        void updateSW(true);
      }
      // Backstop: if controllerchange never fires (null/mixed controller),
      // force a reload anyway — an uncontrolled page reloads fresh from network.
      window.setTimeout(reloadOnce, RELOAD_BACKSTOP_MS);
    };

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        toast("Neue Version verfügbar.", {
          icon: RefreshCw,
          durationMs: 0, // sticky — the user decides when to reload
          action: { label: "Neu laden", onClick: () => void applyUpdate() },
        });
      },
      onRegisteredSW(_swUrl, r) {
        reg = r;
        if (r) {
          interval = window.setInterval(
            () => void r.update(),
            CHECK_INTERVAL_MS,
          );
        }
      },
    });

    // Catch updates the moment the user returns to the tab, between intervals.
    const onVisible = () => {
      if (document.visibilityState === "visible") void reg?.update();
    };
    document.addEventListener("visibilitychange", onVisible);

    onCleanup(() => {
      if (interval !== undefined) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    });
  });

  return null;
}
