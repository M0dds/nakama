import { A } from "@solidjs/router";

/**
 * Placeholder Login. The real one (Discord OAuth + Magic-Link) lands in
 * Phase 2 once the auth-context + supabase session listener are wired up.
 */
export default function Login() {
  return (
    <main class="flex min-h-svh items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <header class="mb-10 text-center">
          <h1 class="text-heading-lg font-medium tracking-tight text-text">
            Nakama
          </h1>
          <p class="mt-2 text-body text-text-muted">
            Login folgt in Phase 2 — Discord OAuth + Magic-Link.
          </p>
        </header>
        <A
          href="/"
          class="block w-full rounded-sm border border-border px-4 py-2 text-center text-body font-medium text-text transition-colors hover:bg-surface"
        >
          Zurück
        </A>
      </div>
    </main>
  );
}
