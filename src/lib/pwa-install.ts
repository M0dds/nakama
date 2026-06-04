import { createSignal } from "solid-js";

/**
 * PWA install plumbing — platform detection + the deferred-prompt capture for
 * the InstallGuide.
 *
 * The `beforeinstallprompt` event (Chromium: Android + desktop) fires EARLY on
 * load, and only once. If we attached the listener inside the InstallGuide
 * component — which mounts late (the last setup step / a profile dialog) — the
 * event would already have fired and been lost. So we listen at module scope
 * and import this module from App.tsx, attaching the listener at app startup.
 * The captured event is stashed; promptInstall() replays it on user click
 * (the browser requires a user gesture, so we can't auto-prompt).
 *
 * iOS Safari fires no such event (and gives no install API at all), so there
 * `canInstall()` stays false and the guide shows manual "Teilen → Zum
 * Home-Bildschirm" steps instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type Platform = "ios" | "android" | "desktop";

const [canInstall, setCanInstall] = createSignal(false);
const [installed, setInstalled] = createSignal(false);
let deferred: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Stop Chrome's default mini-infobar so our own button is the only entry
    // point, then stash the event for replay on click.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    setCanInstall(true);
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    setCanInstall(false);
    setInstalled(true);
  });
}

/** True once Chromium has offered a deferred install prompt we can replay. */
export { canInstall };

/** True after an `appinstalled` event this session. */
export { installed };

/** Already running as an installed PWA (standalone display / iOS home-screen). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag instead of display-mode.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as "MacIntel" with touch points — catch it explicitly.
  const isIpadOS =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || isIpadOS) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * Replay the captured prompt. Returns the user's choice, or null if there was
 * no deferred event (iOS, or already consumed). The event is single-use, so we
 * clear it and flip canInstall off after one call.
 */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | null
> {
  if (!deferred) return null;
  const e = deferred;
  deferred = null;
  setCanInstall(false);
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome;
}
