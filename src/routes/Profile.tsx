import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth } from "@/lib/auth";
import { signOut, getUserHandle } from "@/lib/auth-actions";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/Button";
import { Skeleton } from "@/components/Skeleton";

/**
 * Profile page. Identity block (avatar initial + @handle + email), theme +
 * mode switcher in the right column, sign-out CTA in the aside slot.
 *
 * Phase 2 stub of the real profile from Logbook: avatar URL editing,
 * display-name editing, notifications toggle, account deletion all land
 * later when we wire the `profiles` table. For now the page proves the
 * shell + auth + theme switcher work together.
 */
export default function Profile() {
  const auth = useAuth();
  const navigate = useNavigate();

  const handle = () => {
    const u = auth.user();
    return u ? getUserHandle(u) : "user";
  };

  const onSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

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
                  <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-accent">
                    <span class="font-mono text-heading font-medium text-accent-on">
                      {handle().charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-mono text-body-lg font-medium text-text">
                      @{handle()}
                    </p>
                    <p class="truncate font-mono text-mini text-text-muted">
                      {user().email ?? "—"}
                    </p>
                  </div>
                </div>
              )}
            </Show>

            <div class="mt-6 border-t border-border pt-6">
              <Button variant="secondary" onClick={onSignOut}>
                Abmelden
              </Button>
              <p class="mt-2 text-mini text-text-muted">
                Display-Name, Avatar-Upload und Account-Löschung folgen
                später, sobald wir die <code class="font-mono">profiles</code>
                -Tabelle anbinden.
              </p>
            </div>
          </BentoModule>
        </div>

        {/* Erscheinungsbild — right 1/3 */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Erscheinungsbild" number="02">
            <ThemeSwitcher />
          </BentoModule>
        </div>
      </div>
    </main>
  );
}
