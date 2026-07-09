import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";

/**
 * Shared chrome for the public standalone pages — Landing (/), Features,
 * Datenschutz (LegalLayout) and Styleguide — so they read as one site instead
 * of separate layouts. Mirrors the in-app frosted HeadBar.
 *
 * The CTA is auth-aware: a signed-in visitor continues into the app ("Zur App"
 * → /), a signed-out one gets the login entry ("Anmelden" → /login). This MUST
 * branch now that / serves the landing to signed-out users — a bare "Zur App"
 * → / would just loop them back to the page they're already on.
 */
export function StandaloneHeader() {
  const auth = useAuth();
  return (
    <header class="sticky top-0 z-20 flex items-center justify-between bg-bg/55 px-5 pb-4 pt-[calc(1rem+var(--safe-top))] backdrop-blur-md">
      <A href="/features" class="flex items-center gap-2">
        <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
        <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
          Nakama
        </span>
      </A>
      <Show
        when={auth.user()}
        fallback={
          <A href="/login">
            <Button variant="secondary">Anmelden</Button>
          </A>
        }
      >
        <A href="/">
          <Button variant="secondary">Zur App</Button>
        </A>
      </Show>
    </header>
  );
}

/** Footer shared by the same standalone pages — brand mark + the cross-links
 *  between the three public surfaces. */
export function StandaloneFooter() {
  return (
    <footer class="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-rule px-5 py-6">
      <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
        Nakama
      </span>
      <nav class="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-mini uppercase tracking-wider text-text-muted">
        <A href="/features" class="transition-colors hover:text-text">
          Features
        </A>
        <A href="/privacy" class="transition-colors hover:text-text">
          Datenschutz
        </A>
        <A href="/styleguide" class="transition-colors hover:text-text">
          Styleguide
        </A>
      </nav>
    </footer>
  );
}
