import { A } from "@solidjs/router";

/**
 * Placeholder Home. The real Home (Was kommt / Fortsetzen / Logbuch modules)
 * gets built in Phase 5 once we have items + episodes + sharing.
 */
export default function Home() {
  return (
    <main class="mx-auto max-w-4xl px-5 py-12">
      <p class="font-mono text-mini uppercase tracking-wider text-text-muted">
        NAKAMA · v2 · Foundation
      </p>
      <h1 class="mt-2 text-heading-lg font-medium text-text">
        Willkommen.
      </h1>
      <p class="mt-3 max-w-md text-body text-text-muted">
        Du schaust auf das frische Scaffold. Die echten Module landen in
        Phase 3+. Erstmal: Tokens und Themes sind live, der Styleguide ist
        bereit.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <A
          href="/styleguide"
          class="rounded-sm bg-accent px-4 py-2 text-body font-medium text-accent-on transition-opacity hover:opacity-90"
        >
          Styleguide öffnen
        </A>
        <A
          href="/login"
          class="rounded-sm border border-border px-4 py-2 text-body font-medium text-text transition-colors hover:bg-surface"
        >
          Login (Stub)
        </A>
      </div>
    </main>
  );
}
