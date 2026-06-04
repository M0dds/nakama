import { createSignal, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "@/lib/auth";
import { signOut, getUserHandle } from "@/lib/auth-actions";
import { myProfileOptions } from "@/lib/queries/profile";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { EditableAvatar } from "@/components/EditableAvatar";
import { EditableDisplayName } from "@/components/EditableDisplayName";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { Skeleton } from "@/components/Skeleton";
import { ReleaseNotesDialog } from "@/components/ReleaseNotesDialog";
import { VERSION_LABEL } from "@/lib/version";

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

  return (
    <main class="w-full">
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
        </div>

        {/* Erscheinungsbild — right 1/3 */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Erscheinungsbild" number="02">
            <ThemeSwitcher />
          </BentoModule>
        </div>
      </div>

      {/* Version footer — click opens the full "Was ist neu" history. */}
      <div class="border-t border-rule px-5 py-4">
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          class="font-mono text-mini tracking-wider text-text-muted transition-colors hover:text-accent"
          title="Was ist neu"
        >
          Nakama {VERSION_LABEL}
        </button>
      </div>

      <ReleaseNotesDialog
        open={notesOpen()}
        mode="all"
        onClose={() => setNotesOpen(false)}
      />
    </main>
  );
}
