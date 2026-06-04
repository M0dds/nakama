import { onCleanup, onMount } from "solid-js";
import { registerSW } from "virtual:pwa-register";
import { RefreshCw } from "lucide-solid";
import { useToast } from "@/lib/toast";

/**
 * Service-worker update prompt. Registers the SW (registerType "prompt", so a
 * new SW waits) and, when one is ready, raises a sticky toast — the user taps
 * "Neu laden" to swap in the new version. This is the controlled alternative to
 * autoUpdate's silent reload: no losing a half-typed note to a surprise reload.
 *
 * Why an SPA needs more than the default: client-side navigation never
 * re-checks the SW, so an open tab would otherwise sit on the old version until
 * a hard reload. We force checks two ways — a 30-min interval and on tab
 * re-focus (visibilitychange). `registration.update()` bypasses the browser's
 * 24h SW-cache heuristic, which also fixes the "only a hard reload showed it"
 * symptom.
 *
 * Must render under the ToastProvider (mounted from AppShell) — useToast()
 * needs that context. Renders nothing.
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

export function PwaUpdater() {
  const toast = useToast();

  onMount(() => {
    let reg: ServiceWorkerRegistration | undefined;
    let interval: number | undefined;

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        toast("Neue Version verfügbar.", {
          icon: RefreshCw,
          durationMs: 0, // sticky — the user decides when to reload
          action: { label: "Neu laden", onClick: () => void updateSW(true) },
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
