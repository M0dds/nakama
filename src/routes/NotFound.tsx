import { A } from "@solidjs/router";

export default function NotFound() {
  return (
    <main class="flex min-h-svh items-center justify-center px-6">
      <div class="text-center">
        <p class="font-mono text-mini uppercase tracking-wider text-text-muted">
          404
        </p>
        <h1 class="mt-2 text-heading font-medium text-text">
          Diese Seite gibt es nicht.
        </h1>
        <A
          href="/"
          class="mt-6 inline-block rounded-sm bg-accent px-4 py-2 text-body font-medium text-accent-on transition-opacity hover:opacity-90"
        >
          Zurück zur Startseite
        </A>
      </div>
    </main>
  );
}
