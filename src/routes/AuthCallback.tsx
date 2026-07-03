import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { useAuth } from "@/lib/auth";

/**
 * OAuth + Magic-Link return target. Supabase's JS client is configured with
 * `detectSessionInUrl: true` (see src/lib/supabase.ts) so it picks up the
 * `code` / `access_token` from the URL and trades it for a session on its
 * own — no manual `exchangeCodeForSession` call needed.
 *
 * Our job here is:
 *   1. Show a brief loading state while the exchange runs.
 *   2. When the session settles (AuthProvider's signal fires), route to /.
 *   3. If the URL carries an error, bounce back to /login with that message.
 *      CAREFUL: errors arrive on two channels — providers/PKCE put them in
 *      the QUERY, but the implicit flow (our magic links) returns them in the
 *      HASH (`#error=access_denied&error_code=otp_expired&…`), which
 *      useSearchParams never sees. An expired link used to strand the user on
 *      the eternal "Anmelden …" screen because of exactly that gap.
 *   4. Belt and braces: if after 8 s there's neither a session nor an error
 *      (fragment consumed before we read it, network hang, …), swap the copy
 *      for a way back to /login instead of spinning forever.
 *
 * `?next=…` overrides the post-login target — handy when Phase 5+ wants to
 * route deep-links through login. We don't generate that param yet but
 * support it preemptively.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const [stalled, setStalled] = createSignal(false);

  // Captured eagerly in the component body (runs once, before effects):
  // supabase-js may rewrite the URL once it has processed the fragment.
  const hashParams = new URLSearchParams(window.location.hash.slice(1));

  onMount(() => {
    const desc =
      (typeof searchParams.error_description === "string"
        ? searchParams.error_description
        : undefined) ??
      (typeof searchParams.error === "string" ? searchParams.error : undefined) ??
      hashParams.get("error_description") ??
      hashParams.get("error");
    if (desc) {
      // The one code users actually hit (link expired / already used) gets
      // German copy; anything else shows GoTrue's description verbatim.
      const code = hashParams.get("error_code") ?? searchParams.error_code;
      const msg =
        code === "otp_expired"
          ? "Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an."
          : desc;
      navigate(`/login?error=${encodeURIComponent(msg)}`, { replace: true });
    }
  });

  onMount(() => {
    const t = window.setTimeout(() => setStalled(true), 8_000);
    onCleanup(() => window.clearTimeout(t));
  });

  // When AuthProvider's session signal flips non-null, we're done.
  createEffect(() => {
    if (auth.loading()) return;
    if (auth.user()) {
      const next = searchParams.next;
      navigate(typeof next === "string" && next ? next : "/", {
        replace: true,
      });
    }
  });

  return (
    <main class="flex min-h-svh items-center justify-center px-6">
      <div class="text-center">
        <p class="font-mono text-mini uppercase tracking-wider text-text-muted">
          NAKAMA
        </p>
        <Show
          when={stalled()}
          fallback={
            <>
              <h1 class="mt-2 text-heading font-medium text-text">
                Anmelden …
              </h1>
              <p class="mt-2 text-body text-text-muted">
                Einen Moment, gleich geht's weiter.
              </p>
            </>
          }
        >
          <h1 class="mt-2 text-heading font-medium text-text">
            Das hat nicht geklappt.
          </h1>
          <p class="mt-2 text-body text-text-muted">
            Die Anmeldung hängt — der Link war vielleicht abgelaufen.
          </p>
          <A
            href="/login"
            class="mt-4 inline-block rounded-xs font-mono text-label uppercase tracking-wider text-accent underline-offset-4 hover:underline"
          >
            Zurück zur Anmeldung
          </A>
        </Show>
      </div>
    </main>
  );
}
