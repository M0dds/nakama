import { createSignal, Show, createEffect } from "solid-js";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import {
  signInWithDiscord,
  signInWithMagicLink,
} from "@/lib/auth-actions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/Button";

/**
 * Login page — Discord OAuth + Magic-Link. No PageHeader / BentoModule:
 * this is a focal landing page, not part of the bento-instrument shell.
 *
 * If the user is already signed in (came back to /login while authed, e.g.
 * after deep-linking), we bounce them to /. The redirect runs in an effect
 * so it happens after hydration, not during render.
 *
 * `?error=` and `?message=` come from /auth/callback when the OAuth or
 * magic-link exchange fails or succeeds in a way that wants a message.
 */
export default function Login() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = createSignal("");
  const [pending, setPending] = createSignal<"discord" | "magic" | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [sentTo, setSentTo] = createSignal<string | null>(null);

  // Pre-fill error from query (e.g. callback redirected back with a problem).
  createEffect(() => {
    const e = searchParams.error;
    if (typeof e === "string" && e) setError(e);
  });

  // Already authed → home.
  createEffect(() => {
    if (!auth.loading() && auth.user()) navigate("/", { replace: true });
  });

  const onDiscord = async () => {
    setError(null);
    setPending("discord");
    const res = await signInWithDiscord();
    if (res.error) {
      setError(res.error);
      setPending(null);
    }
    // On success the browser is mid-redirect to Discord — leave `pending`
    // set so the button stays disabled until the page unloads.
  };

  const onMagicLink = async (e: SubmitEvent) => {
    e.preventDefault();
    setError(null);
    setSentTo(null);
    setPending("magic");
    const res = await signInWithMagicLink(email());
    setPending(null);
    if (res.error) setError(res.error);
    if (res.sent) setSentTo(email());
  };

  return (
    <main class="flex min-h-svh items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <header class="mb-10 text-center">
          <div class="mb-4 flex justify-center">
            <span aria-hidden class="size-3 rounded-full bg-accent" />
          </div>
          <h1 class="text-heading-lg font-medium tracking-tight text-text">
            Nakama
          </h1>
          <p class="mt-2 text-body text-text-muted">
            Melde dich an, um deine Listen zu sehen.
          </p>
        </header>

        <div class="space-y-5 rounded-sm border border-border bg-surface p-6">
          {/* Discord */}
          <Button
            variant="primary"
            class="w-full"
            disabled={pending() !== null}
            onClick={onDiscord}
          >
            {pending() === "discord"
              ? "Verbinde mit Discord …"
              : "Mit Discord anmelden"}
          </Button>

          <div class="flex items-center gap-3">
            <div class="h-px flex-1 bg-border" />
            <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
              oder
            </span>
            <div class="h-px flex-1 bg-border" />
          </div>

          {/* Magic Link */}
          <form onSubmit={onMagicLink} class="space-y-3">
            <label for="email" class="block">
              <span class="mb-1.5 block font-mono text-mini uppercase tracking-wider text-text-muted">
                E-Mail
              </span>
              <input
                id="email"
                type="email"
                name="email"
                required
                placeholder="du@beispiel.de"
                autocomplete="email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="w-full rounded-sm border border-border bg-bg px-3 py-2 text-body text-text outline-none transition-colors placeholder:text-text-muted focus:border-accent"
              />
            </label>
            <Button
              type="submit"
              variant="secondary"
              class="w-full"
              disabled={pending() !== null}
            >
              {pending() === "magic"
                ? "Sende Magic Link …"
                : "Magic Link schicken"}
            </Button>
          </form>

          <Show when={error()}>
            <p role="status" class="text-body text-accent">
              {error()}
            </p>
          </Show>
          <Show when={sentTo()}>
            <p role="status" class="text-body text-text">
              Magic Link verschickt an{" "}
              <span class="font-mono">{sentTo()}</span>. Check dein
              Postfach (auch Spam).
            </p>
          </Show>

          <p class="font-mono text-mini text-text-muted">
            Beim ersten Login wird automatisch ein Profil angelegt.
          </p>
        </div>

        <p class="mt-6 text-center text-body text-text-muted">
          Neu hier?{" "}
          <A
            href="/features"
            class="text-text underline-offset-2 hover:underline"
          >
            Was ist Nakama?
          </A>
        </p>
      </div>
    </main>
  );
}
