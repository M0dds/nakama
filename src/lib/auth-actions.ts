import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * SPA-side wrappers for Supabase auth flows. Both flows ship the user to
 * `/auth/callback` once the provider finishes — the AuthCallback route then
 * lets the Supabase JS client (configured with `detectSessionInUrl: true`)
 * exchange the code, watches for the session, and routes to `/`.
 */

function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

/**
 * Discord OAuth. Supabase returns the provider URL; the JS client defaults
 * to navigating the browser to it automatically (`skipBrowserRedirect: false`).
 * On error we surface the message — never silently swallow.
 */
export async function signInWithDiscord(): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: callbackUrl(),
      // Explicitly request the verified email — it's the linchpin of the auth
      // model: Supabase auto-links the email identity to this Discord user, so
      // a magic link to that same address recovers INTO the same account. Also
      // what we show on the profile. (Discord's default scope can change; pin
      // it.)
      scopes: "identify email",
    },
  });
  if (error) return { error: `Discord-Login fehlgeschlagen: ${error.message}` };
  return {};
}

/**
 * Magic link. Sends an email with a one-time login URL. The success path is
 * a screen state ("schau ins Postfach"), not a redirect — the user only lands
 * back in the app after clicking the link.
 */
export async function signInWithMagicLink(
  email: string,
): Promise<{ error?: string; sent?: true }> {
  const trimmed = email.trim();
  if (!trimmed) return { error: "Bitte gib eine E-Mail-Adresse ein." };

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: callbackUrl(),
    },
  });
  if (error) return { error: error.message };
  return { sent: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  // The AuthProvider's onAuthStateChange picks up SIGNED_OUT and flips
  // session() to null; ProtectedRoute then bounces to /login.
}

/**
 * Preferred handle for @-style display. Discord OAuth populates user_metadata
 * with several name candidates; we pick the unique handle (user_name /
 * preferred_username / name) over display-style fields. Magic-link users have
 * empty metadata, so they fall back to display_name (written by the
 * handle_new_user trigger) or, last resort, the email-local-part. Leading "@"
 * is NOT included — callers render it explicitly so non-@-contexts can use
 * the bare handle. Mirrors src/lib/user.ts in the old Logbook codebase.
 */
export function getUserHandle(
  user: User,
  profile?: { display_name?: string | null; username?: string | null } | null,
): string {
  if (profile?.username) return profile.username;

  const md = user.user_metadata as Record<string, unknown> | undefined;
  if (md) {
    for (const key of ["user_name", "preferred_username", "name"] as const) {
      const value = md[key];
      if (typeof value === "string" && value.length > 0) {
        return stripDiscordDiscriminator(value);
      }
    }
  }

  if (profile?.display_name) return stripDiscordDiscriminator(profile.display_name);
  if (user.email) return user.email.split("@")[0];
  return "user";
}

/**
 * Discord-migrated users come through OAuth with a legacy "#0" suffix on
 * their `user_name`. Pre-2023 accounts also carry "#1234"-style
 * discriminators. Either way the modern Discord handle is the part before
 * the "#".
 */
function stripDiscordDiscriminator(handle: string): string {
  return handle.replace(/#\d+$/, "");
}
