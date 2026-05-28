import { createEffect, onMount } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
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
 *   3. If the URL carries `error_description` (provider rejected, etc.),
 *      bounce back to /login with that message.
 *
 * `?next=…` overrides the post-login target — handy when Phase 5+ wants to
 * route deep-links through login. We don't generate that param yet but
 * support it preemptively.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams();

  // Provider-side rejection lands in `error_description`. Catch + bounce.
  onMount(() => {
    const desc = searchParams.error_description ?? searchParams.error;
    if (typeof desc === "string" && desc) {
      navigate(`/login?error=${encodeURIComponent(desc)}`, { replace: true });
    }
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
        <h1 class="mt-2 text-heading font-medium text-text">
          Anmelden …
        </h1>
        <p class="mt-2 text-body text-text-muted">
          Einen Moment, gleich geht's weiter.
        </p>
      </div>
    </main>
  );
}
