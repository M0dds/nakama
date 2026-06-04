import { ErrorBoundary, type ParentProps } from "solid-js";
import { useTrackNavigation } from "@/lib/navigation";
// Side-effect import: attaches the beforeinstallprompt listener at app startup
// (the event fires early and once — see pwa-install.ts) so the InstallGuide,
// which mounts late, can still offer a 1-click install.
import "@/lib/pwa-install";
// Side-effect import: registers the service worker at app startup and exposes
// the silent `updateReady` flag (badge on the profile nav + profile row).
import "@/lib/pwa-update";

/**
 * Root layout wrapper around every route. The grain overlay sits as a fixed
 * pseudo-layer above the bg — flat depth via texture, not shadow.
 *
 * The ErrorBoundary is the safety net: the routes are lazy()-split, so a render
 * error OR a failed chunk import (e.g. a stale dynamic import after a deploy /
 * dev HMR) would otherwise put Solid's render root into an errored state —
 * a blank page that even client-side navigation can't recover, only a reload.
 * The boundary turns that into a recoverable card instead of a white screen,
 * and surfaces the message so the actual fault is diagnosable.
 */
export default function App(props: ParentProps) {
  // Track in-app navigations so the back affordances know when history.back()
  // is safe (stays in-app) vs. when to use a fallback href (deep-link).
  useTrackNavigation();
  return (
    <>
      <div
        aria-hidden
        class="grain-layer pointer-events-none fixed inset-0 z-50 opacity-[0.04] mix-blend-multiply dark:opacity-[0.06] dark:mix-blend-screen"
      />
      <div class="relative min-h-svh">
        <ErrorBoundary
          fallback={(err, reset) => <RouteError error={err} reset={reset} />}
        >
          {props.children}
        </ErrorBoundary>
      </div>
    </>
  );
}

function RouteError(props: { error: unknown; reset: () => void }) {
  const message =
    props.error instanceof Error
      ? props.error.message
      : String(props.error ?? "Unbekannter Fehler");
  return (
    <div class="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p class="font-mono text-mini uppercase tracking-wider text-accent">
        Etwas ist schiefgelaufen
      </p>
      <p class="max-w-md text-body text-text-muted">
        Diese Ansicht konnte nicht geladen werden. Ein Neuladen behebt das
        meist — oft hängt nur eine veraltete Version nach einem Update fest.
      </p>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          class="rounded-xs bg-accent px-4 py-2 font-mono text-mini uppercase tracking-wider text-accent-on transition-opacity hover:opacity-90"
        >
          Neu laden
        </button>
        <button
          type="button"
          onClick={props.reset}
          class="rounded-xs border border-border px-4 py-2 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          Erneut versuchen
        </button>
      </div>
      <p class="max-w-md break-words font-mono text-mini text-text-muted opacity-70">
        {message}
      </p>
    </div>
  );
}
