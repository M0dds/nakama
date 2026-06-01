import { createSignal, Show, createEffect } from "solid-js";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import {
  signInWithDiscord,
  signInWithMagicLink,
} from "@/lib/auth-actions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/Button";

/** Discord's brand glyph — lucide ships no brand icons, so the mark is inlined.
 *  `currentColor` so it inherits the button's text color. */
function DiscordMark(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      class={props.class}
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

/**
 * Login — Discord is the primary (and recommended) path: its unique usernames
 * give us clean, unspoofable @handles. Magic-Link is tucked behind a "Kein
 * Discord-Konto?" disclosure as a fallback (it recovers into the SAME account
 * thanks to Supabase's same-email identity linking).
 *
 * If already signed in (deep-linked back to /login while authed), bounce to /.
 * The redirect runs in an effect so it happens after hydration, not in render.
 * `?error=` / `?message=` come from /auth/callback on a failed/odd exchange.
 */
export default function Login() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = createSignal("");
  const [pending, setPending] = createSignal<"discord" | "magic" | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [sentTo, setSentTo] = createSignal<string | null>(null);
  // Magic-Link form is collapsed by default — Discord is the front door.
  const [showEmail, setShowEmail] = createSignal(false);

  createEffect(() => {
    const e = searchParams.error;
    if (typeof e === "string" && e) {
      setError(e);
      // A callback error almost always came from the email path → reveal it so
      // the message has context and the user can retry.
      setShowEmail(true);
    }
  });

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
    // On success the browser is mid-redirect to Discord — leave `pending` set
    // so the button stays disabled until the page unloads.
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
      <div class="w-full max-w-xs">
        {/* Brand block — hanko dot sits inline, left of the wordmark. */}
        <header class="mb-12 text-center">
          <div class="flex items-center justify-center gap-2.5">
            <span aria-hidden class="size-2.5 rounded-full bg-accent" />
            <h1 class="text-heading-lg font-medium tracking-tight text-text">
              Nakama
            </h1>
          </div>
          <p class="mt-2 text-body text-text-muted">
            Was schaust du als Nächstes?
          </p>
        </header>

        {/* Discord — the hero. */}
        <Button
          variant="primary"
          class="flex w-full items-center justify-center gap-2.5 py-3"
          disabled={pending() !== null}
          onClick={onDiscord}
        >
          <DiscordMark class="size-5 shrink-0" />
          <span>
            {pending() === "discord"
              ? "Verbinde mit Discord …"
              : "Mit Discord anmelden"}
          </span>
        </Button>

        {/* Fallback disclosure — quiet by default. */}
        <Show
          when={showEmail()}
          fallback={
            <button
              type="button"
              onClick={() => setShowEmail(true)}
              class="mt-5 block w-full text-center font-mono text-mini uppercase tracking-wider text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
            >
              Kein Discord-Konto?
            </button>
          }
        >
          <div class="mt-8">
            <div class="mb-5 flex items-center gap-3">
              <div class="h-px flex-1 bg-border" />
              <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
                per E-Mail
              </span>
              <div class="h-px flex-1 bg-border" />
            </div>

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
          </div>
        </Show>

        <Show when={error()}>
          <p role="status" class="mt-5 text-center text-body text-accent">
            {error()}
          </p>
        </Show>
        <Show when={sentTo()}>
          <p role="status" class="mt-5 text-center text-body text-text">
            Magic Link verschickt an{" "}
            <span class="font-mono">{sentTo()}</span>. Check dein Postfach
            (auch Spam).
          </p>
        </Show>

        <p class="mt-10 text-center text-body text-text-muted">
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
