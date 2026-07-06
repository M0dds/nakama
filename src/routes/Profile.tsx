import { createSignal, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { A, useNavigate } from "@solidjs/router";
import { ChevronRight, Loader2, RefreshCw } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { signOut, getUserHandle } from "@/lib/auth-actions";
import { myProfileOptions } from "@/lib/queries/profile";
import { PageHeader } from "@/components/PageHeader";
import { CoverBackdrop } from "@/components/CoverBackdrop";
import { BentoModule } from "@/components/BentoModule";
import { PushSettings } from "@/components/PushSettings";
import { ColumnGuide } from "@/components/ColumnGuide";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { EditableAvatar } from "@/components/EditableAvatar";
import { EditableDisplayName } from "@/components/EditableDisplayName";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { Skeleton } from "@/components/Skeleton";
import { ReleaseNotesDialog } from "@/components/ReleaseNotesDialog";
import { InstallDialog } from "@/components/InstallDialog";
import { VERSION_LABEL } from "@/lib/version";
import { isStandalone } from "@/lib/pwa-install";
import { applyUpdate, updateReady, updating } from "@/lib/pwa-update";

/**
 * Profile page. Konto module (left 2/3): editable identity — avatar upload
 * (EditableAvatar → avatars storage bucket), inline display-name edit
 * (EditableDisplayName → profiles.display_name), @handle + email as stable
 * secondary lines, and the account-deletion danger zone (DeleteAccountSection)
 * at the bottom. Erscheinungsbild module (right 1/3): theme + mode switcher.
 * Sign-out lives in the PageHeader aside (page-level account action, same slot
 * as Liste löschen/verlassen on the list-detail page).
 */
export default function Profile() {
  const auth = useAuth();
  const navigate = useNavigate();

  const profileQ = createQuery(() => ({
    ...myProfileOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  const profile = () => profileQ.data ?? null;

  const handle = () => {
    const u = auth.user();
    if (!u) return "user";
    const p = profile();
    return getUserHandle(
      u,
      p ? { display_name: p.displayName, username: p.username } : undefined,
    );
  };
  const avatarUrl = () => profile()?.avatarUrl ?? null;

  const onSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const [notesOpen, setNotesOpen] = createSignal(false);
  const [installOpen, setInstallOpen] = createSignal(false);

  return (
    <main class="w-full">
      {/* Profil has no media cover — the user's own avatar is the page's
          identity, so it drives the ambient backdrop (static; no avatar → none). */}
      <CoverBackdrop coverUrl={avatarUrl()} />
      <PageHeader
        title="Profil"
        aside={
          <button
            type="button"
            onClick={onSignOut}
            class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
          >
            Abmelden
          </button>
        }
      />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Konto — left 2/3 */}
        <div class="md:w-2/3">
          <BentoModule label="Konto" number="01">
            <Show
              when={auth.user()}
              fallback={
                <div class="flex items-center gap-4">
                  <Skeleton class="size-16 shrink-0 rounded-full" />
                  <div class="min-w-0 flex-1">
                    <Skeleton class="h-5 w-32" />
                    <Skeleton class="mt-2 h-3 w-40" />
                  </div>
                </div>
              }
            >
              {(user) => (
                <div class="flex items-center gap-4">
                  <EditableAvatar
                    userId={user().id}
                    handle={handle()}
                    avatarUrl={avatarUrl()}
                  />
                  <div class="min-w-0">
                    <EditableDisplayName
                      userId={user().id}
                      initialName={profile()?.displayName ?? null}
                      handle={handle()}
                    />
                    <p class="truncate font-mono text-mini text-text-muted">
                      @{handle()}
                    </p>
                    <p class="truncate font-mono text-mini text-text-muted">
                      {user().email ?? "—"}
                    </p>
                  </div>
                </div>
              )}
            </Show>

            <DeleteAccountSection />
          </BentoModule>

          <BentoModule
            label="Benachrichtigungen"
            number="02"
            class="border-t border-rule"
          >
            <PushSettings />
          </BentoModule>
        </div>

        {/* Right 1/3: Erscheinungsbild stacked over Über — the two short
            modules together balance the taller Konto column, so the page reads
            as filled rather than a sparse two-column header with floating
            footer buttons. */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Erscheinungsbild" number="03">
            <ThemeSwitcher />
          </BentoModule>

          <BentoModule label="Über" number="04" class="border-t border-rule">
            {/* Exact Home-Logbuch list idiom: no divider under the section
                header, hairline dividers BETWEEN rows only, inset to the px-5
                content (after:inset-x-5) so they align with the text and don't
                touch the column line on the left. The hover fill is its own
                layer inset 1px on the left so it stops at the ColumnGuide
                instead of painting over it. */}
            <ul class="-mx-5">
              {/* Update verfügbar → neu laden (silent: only here + the nav
                  badge, no toast). applyUpdate skip-waits the new SW + reloads
                  — that takes up to ~3s, so the row flips to a spinner +
                  "Aktualisiere …" for the gap (otherwise the tap reads as a
                  dead no-op until the page suddenly reloads). */}
              <Show when={updateReady()}>
                <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                  <button
                    type="button"
                    onClick={() => applyUpdate()}
                    disabled={updating()}
                    class="group/row relative isolate flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left focus:outline-none"
                  >
                    <span
                      aria-hidden
                      class="pointer-events-none absolute inset-y-0 left-px right-0 -z-10 bg-surface opacity-0 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] group-hover/row:opacity-100"
                    />
                    <span class="min-w-0">
                      <span class="block font-mono text-mini uppercase tracking-wider text-accent">
                        Update verfügbar
                      </span>
                      <span class="mt-0.5 block text-label text-text">
                        {updating()
                          ? "Neue Version wird geladen …"
                          : "Neu laden, um zu aktualisieren"}
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-1 font-mono text-mini uppercase tracking-wider text-accent">
                      <Show
                        when={updating()}
                        fallback={
                          <>
                            Neu laden
                            <RefreshCw
                              class="size-3.5"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </>
                        }
                      >
                        Aktualisiere
                        <Loader2
                          class="size-3.5 animate-spin"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </Show>
                    </span>
                  </button>
                </li>
              </Show>

              {/* Version → Release Notes */}
              <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                <button
                  type="button"
                  onClick={() => setNotesOpen(true)}
                  class="group/row relative isolate flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left focus:outline-none"
                >
                  <span
                    aria-hidden
                    class="pointer-events-none absolute inset-y-0 left-px right-0 -z-10 bg-surface opacity-0 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] group-hover/row:opacity-100"
                  />
                  <span class="min-w-0">
                    <span class="block font-mono text-mini uppercase tracking-wider text-text-muted">
                      Version
                    </span>
                    <span class="mt-0.5 block font-mono text-label text-text">
                      {VERSION_LABEL}
                    </span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors group-hover/row:text-accent">
                    Release Notes
                    <ChevronRight
                      class="size-3.5"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                  </span>
                </button>
              </li>

              {/* App installieren (hidden once running standalone) */}
              <Show when={!isStandalone()}>
                <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                  <button
                    type="button"
                    onClick={() => setInstallOpen(true)}
                    class="group/row relative isolate flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left focus:outline-none"
                  >
                    <span
                      aria-hidden
                      class="pointer-events-none absolute inset-y-0 left-px right-0 -z-10 bg-surface opacity-0 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] group-hover/row:opacity-100"
                    />
                    <span class="min-w-0">
                      <span class="block font-mono text-mini uppercase tracking-wider text-text-muted">
                        App
                      </span>
                      <span class="mt-0.5 block text-label text-text">
                        Auf dem Home-Bildschirm
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-1 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors group-hover/row:text-accent">
                      Installieren
                      <ChevronRight
                        class="size-3.5"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </span>
                  </button>
                </li>
              </Show>

              {/* Datenschutz — opens the standalone /privacy page. (Impressum
                  is a deferred draft; its row returns once it's routed.) */}
              <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                <A
                  href="/privacy"
                  class="group/row relative isolate flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left focus:outline-none"
                >
                  <span
                    aria-hidden
                    class="pointer-events-none absolute inset-y-0 left-px right-0 -z-10 bg-surface opacity-0 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] group-hover/row:opacity-100"
                  />
                  <span class="min-w-0">
                    <span class="block font-mono text-mini uppercase tracking-wider text-text-muted">
                      Datenschutz
                    </span>
                    <span class="mt-0.5 block text-label text-text">
                      Wie wir mit deinen Daten umgehen
                    </span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors group-hover/row:text-accent">
                    Öffnen
                    <ChevronRight class="size-3.5" strokeWidth={1.75} aria-hidden />
                  </span>
                </A>
              </li>
            </ul>
          </BentoModule>
        </div>
      </div>

      <ReleaseNotesDialog
        open={notesOpen()}
        onClose={() => setNotesOpen(false)}
      />
      <InstallDialog
        open={installOpen()}
        onClose={() => setInstallOpen(false)}
      />
    </main>
  );
}
