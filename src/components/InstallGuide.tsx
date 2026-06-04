import { createSignal, Match, Show, Switch } from "solid-js";
import { Loader2 } from "lucide-solid";
import { Button } from "@/components/Button";
import {
  canInstall,
  getPlatform,
  installed,
  isFirefox,
  isStandalone,
  promptInstall,
} from "@/lib/pwa-install";

/**
 * Platform-aware "install Nakama" action — the BODY only (no title/icon
 * chrome). The context provides the heading: the /setup step renders a centered
 * h1 above it, InstallDialog a kicker header. Kept minimal and on-brand: hard
 * corners, hairlines, mono labels — no decorative icon badges.
 *
 * Four paths:
 *   - already standalone → a one-line "nothing to do" note.
 *   - Chromium with a captured beforeinstallprompt → a single primary button
 *     that replays the native prompt.
 *   - iOS Safari (no install API) → two numbered text steps.
 *   - anything else (desktop Firefox, prompt not fired) → a browser-menu hint.
 *
 * Why bother on iOS: iOS only allows web-push from an INSTALLED PWA, so the
 * home-screen install is the gate for notifications later (PRE-LAUNCH #4).
 *
 * NOTE: the 1-click button only appears once the browser fires
 * `beforeinstallprompt` (Chromium over HTTPS with a registered SW) — production
 * / `npm run preview`, NOT the plain dev server.
 */
export function InstallGuide() {
  const platform = getPlatform();
  const [busy, setBusy] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);

  const done = () => isStandalone() || installed();

  const onInstall = async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "dismissed") setDismissed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Switch>
      {/* ── Already installed ── */}
      <Match when={done()}>
        <p class="text-body text-text-muted">
          Du hast Nakama schon als App auf dem Home-Bildschirm.
        </p>
      </Match>

      {/* ── Chromium 1-click (Android / desktop) ── */}
      <Match when={canInstall()}>
        <div class="flex flex-col items-center gap-3">
          <Button
            variant="primary"
            onClick={onInstall}
            disabled={busy()}
            class="inline-flex items-center gap-2"
          >
            <Show when={busy()}>
              <Loader2 class="size-4 animate-spin" aria-hidden />
            </Show>
            Installieren
          </Button>
          <Show when={dismissed()}>
            <p class="text-mini text-text-muted">
              Kein Problem — später jederzeit im Profil nachholbar.
            </p>
          </Show>
        </div>
      </Match>

      {/* ── iOS manual steps ── */}
      <Match when={platform === "ios"}>
        <ol class="mx-auto max-w-xs space-y-2.5 text-left">
          <li class="flex items-center gap-3">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-xs border border-border font-mono text-mini text-text-muted">
              1
            </span>
            <span class="text-body text-text">
              Tippe unten auf <span class="text-accent">Teilen</span>.
            </span>
          </li>
          <li class="flex items-center gap-3">
            <span class="flex size-6 shrink-0 items-center justify-center rounded-xs border border-border font-mono text-mini text-text-muted">
              2
            </span>
            <span class="text-body text-text">
              Wähle <span class="text-accent">Zum Home-Bildschirm</span>.
            </span>
          </li>
        </ol>
      </Match>

      {/* ── Desktop Firefox / Zen: no PWA install at all ── */}
      <Match when={platform === "desktop" && isFirefox()}>
        <p class="text-body text-text-muted">
          Firefox unterstützt das Installieren als App am Desktop leider nicht.
          Öffne Nakama in Chrome, Edge oder Safari, um es auf den
          Home-Bildschirm zu legen.
        </p>
      </Match>

      {/* ── Fallback (other browsers without a captured prompt) ── */}
      <Match when={true}>
        <p class="text-body text-text-muted">
          Im Menü deines Browsers findest du „Installieren" bzw. „Zum
          Startbildschirm hinzufügen".
        </p>
      </Match>
    </Switch>
  );
}
