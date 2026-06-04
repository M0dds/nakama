import { createSignal, Match, Show, Switch } from "solid-js";
import { Check, Download, Loader2, Plus, Share } from "lucide-solid";
import { Button } from "@/components/Button";
import {
  canInstall,
  getPlatform,
  installed,
  isStandalone,
  promptInstall,
} from "@/lib/pwa-install";

/**
 * Platform-aware "install Nakama as an app" guidance. Presentational + inline —
 * used both as the final /setup step and inside a profile dialog.
 *
 * Three paths:
 *   - already standalone (or installed this session) → a done state.
 *   - Chromium with a captured beforeinstallprompt (Android/desktop) → a single
 *     "Installieren" button that replays the prompt.
 *   - iOS Safari (no install API) → manual "Teilen → Zum Home-Bildschirm" steps.
 *   - anything else (e.g. desktop Firefox, prompt already dismissed) → a short
 *     "über das Browser-Menü" hint, so the screen is never empty.
 *
 * Why bother on iOS at all: iOS only allows web-push from an INSTALLED PWA, so
 * the home-screen install is the gate for notifications later (PRE-LAUNCH #4).
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
    <div class="text-center">
      <Switch>
        {/* ── Already installed ── */}
        <Match when={done()}>
          <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10">
            <Check class="size-6 text-accent" strokeWidth={2} aria-hidden />
          </div>
          <h2 class="mt-4 text-heading font-medium tracking-tight text-text">
            Läuft schon als App
          </h2>
          <p class="mx-auto mt-2 max-w-xs text-body text-text-muted">
            Du hast Nakama auf dem Home-Bildschirm — perfekt. Nichts weiter zu
            tun.
          </p>
        </Match>

        {/* ── Chromium 1-click (Android / desktop) ── */}
        <Match when={canInstall()}>
          <h2 class="text-heading font-medium tracking-tight text-text">
            Nakama als App
          </h2>
          <p class="mx-auto mt-2 max-w-xs text-body text-text-muted">
            Installier Nakama wie eine echte App — eigenes Icon, voller
            Bildschirm, schneller Start.
          </p>
          <div class="mt-6 flex justify-center">
            <Button
              variant="primary"
              onClick={onInstall}
              disabled={busy()}
              class="inline-flex items-center gap-2"
            >
              <Show
                when={!busy()}
                fallback={<Loader2 class="size-4 animate-spin" />}
              >
                <Download class="size-4" strokeWidth={1.75} aria-hidden />
              </Show>
              Installieren
            </Button>
          </div>
          <Show when={dismissed()}>
            <p class="mx-auto mt-3 max-w-xs text-mini text-text-muted">
              Kein Problem — du kannst es später jederzeit im Profil nachholen.
            </p>
          </Show>
        </Match>

        {/* ── iOS manual steps ── */}
        <Match when={platform === "ios"}>
          <h2 class="text-heading font-medium tracking-tight text-text">
            Nakama als App
          </h2>
          <p class="mx-auto mt-2 max-w-xs text-body text-text-muted">
            In zwei Schritten auf den Home-Bildschirm:
          </p>
          <ol class="mx-auto mt-6 max-w-xs space-y-3 text-left">
            <li class="flex items-center gap-3">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-xs border border-border font-mono text-mini text-text-muted">
                1
              </span>
              <span class="flex flex-1 items-center gap-1.5 text-body text-text">
                Tippe unten auf
                <Share class="size-4 text-accent" strokeWidth={1.75} aria-hidden />
                <span class="font-medium">Teilen</span>
              </span>
            </li>
            <li class="flex items-center gap-3">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-xs border border-border font-mono text-mini text-text-muted">
                2
              </span>
              <span class="flex flex-1 items-center gap-1.5 text-body text-text">
                Wähle
                <Plus class="size-4 text-accent" strokeWidth={1.75} aria-hidden />
                <span class="font-medium">Zum Home-Bildschirm</span>
              </span>
            </li>
          </ol>
        </Match>

        {/* ── Fallback (desktop Firefox, prompt unavailable) ── */}
        <Match when={true}>
          <h2 class="text-heading font-medium tracking-tight text-text">
            Nakama als App
          </h2>
          <p class="mx-auto mt-2 max-w-xs text-body text-text-muted">
            Über das Menü deines Browsers findest du „Installieren" bzw. „Zum
            Startbildschirm hinzufügen" — dann startet Nakama wie eine eigene
            App.
          </p>
        </Match>
      </Switch>
    </div>
  );
}
