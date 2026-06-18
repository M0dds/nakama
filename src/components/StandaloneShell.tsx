import { A } from "@solidjs/router";
import { Button } from "@/components/Button";

/**
 * Shared chrome for the public standalone pages — Features, Datenschutz
 * (LegalLayout) and Styleguide — so they read as one site instead of three
 * different layouts. Mirrors the in-app frosted HeadBar.
 *
 * The single CTA is "Zur App" (→ "/"): for signed-in users it drops them into
 * the app, for new users the app's auth guard routes them to login. One verb
 * that makes sense in both states — clearer than "Anmelden", which reads wrong
 * for someone who's already signed in.
 */
export function StandaloneHeader() {
  return (
    <header class="sticky top-0 z-20 flex items-center justify-between bg-bg/55 px-5 py-4 backdrop-blur-md">
      <A href="/features" class="flex items-center gap-2">
        <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
        <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
          Nakama
        </span>
      </A>
      <A href="/">
        <Button variant="secondary">Zur App</Button>
      </A>
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
