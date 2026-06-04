import { createSignal, Match, onMount, Show, Switch } from "solid-js";
import { Bell } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { getPlatform, isStandalone } from "@/lib/pwa-install";
import {
  isPushSubscribed,
  pushPermission,
  pushSupported,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
  type PushPermission,
} from "@/lib/queries/push";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";

/**
 * The functional "Benachrichtigungen" section (replaces the placeholder).
 * Permission + subscribe + a manual "Test senden" button so push can be
 * verified without waiting for a real release.
 *
 * Needs a service worker → only meaningful in preview/prod, not the dev server
 * (subscribeToPush gates on a SW-ready check so a dev toggle can't hang). iOS
 * only allows web-push from the INSTALLED PWA, so there we point at the install
 * entry instead of offering the toggle.
 */
export function PushSettings() {
  const auth = useAuth();
  const toast = useToast();

  const supported = pushSupported();
  const iosNeedsInstall = getPlatform() === "ios" && !isStandalone();

  const [perm, setPerm] = createSignal<PushPermission>(pushPermission());
  const [subscribed, setSubscribed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  onMount(async () => {
    setSubscribed(await isPushSubscribed());
  });

  const enable = async () => {
    const uid = auth.user()?.id;
    if (!uid || busy()) return;
    setBusy(true);
    const res = await subscribeToPush(uid);
    setPerm(pushPermission());
    setBusy(false);
    if (res.ok) {
      setSubscribed(true);
      toast("Benachrichtigungen aktiviert.", { icon: Bell });
    } else if (res.error === "denied") {
      toast("Im Browser blockiert — in den Seiten-Einstellungen erlauben.");
    } else if (res.error === "no_sw") {
      toast("Geht nur in der installierten App.");
    } else if (res.error !== "dismissed") {
      toast("Konnte nicht aktiviert werden.");
    }
  };

  const disable = async () => {
    if (busy()) return;
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    setSubscribed(false);
    toast("Benachrichtigungen aus.");
  };

  const test = async () => {
    if (busy()) return;
    setBusy(true);
    const res = await sendTestPush();
    setBusy(false);
    if (res.ok)
      toast(
        res.sent
          ? "Test gesendet — gleich poppt die Benachrichtigung."
          : "Kein aktives Abo gefunden.",
        { icon: Bell },
      );
    else toast("Test fehlgeschlagen.");
  };

  return (
    <Switch>
      {/* iOS in the browser: web-push needs the installed PWA first. */}
      <Match when={iosNeedsInstall}>
        <p class="text-mini text-text-muted">
          Auf dem iPhone funktionieren Benachrichtigungen erst, wenn Nakama als
          App installiert ist — siehe „Über" → Installieren. Danach hier
          aktivierbar.
        </p>
      </Match>

      <Match when={!supported}>
        <p class="text-mini text-text-muted">
          Dein Browser unterstützt keine Push-Benachrichtigungen.
        </p>
      </Match>

      <Match when={true}>
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-body text-text">Push-Benachrichtigungen</p>
            <p class="mt-1 text-mini text-text-muted">
              Eine Nachricht bei neuen Folgen oder Releases.
            </p>
          </div>
          <Show
            when={subscribed()}
            fallback={
              <Button
                variant="primary"
                onClick={enable}
                disabled={busy()}
                class="shrink-0"
              >
                {busy() ? "Moment …" : "Aktivieren"}
              </Button>
            }
          >
            <Badge tone="accent" class="shrink-0">
              Aktiv
            </Badge>
          </Show>
        </div>

        <Show when={subscribed()}>
          <div class="mt-4 flex items-center gap-4">
            <Button variant="secondary" onClick={test} disabled={busy()}>
              <Bell class="size-4" strokeWidth={1.75} aria-hidden />
              Test senden
            </Button>
            <button
              type="button"
              onClick={disable}
              disabled={busy()}
              class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent disabled:opacity-40"
            >
              Deaktivieren
            </button>
          </div>
        </Show>

        <Show when={perm() === "denied" && !subscribed()}>
          <p class="mt-3 text-mini text-text-muted">
            Benachrichtigungen sind im Browser blockiert — erlaube sie in den
            Seiten-Einstellungen, dann erneut aktivieren.
          </p>
        </Show>
      </Match>
    </Switch>
  );
}
