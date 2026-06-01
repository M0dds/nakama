import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * The signed-in user's own `profiles` row. profiles RLS exposes the caller's
 * own row, so a self-lookup by user_id returns username + display_name +
 * avatar_url — the same three fields the roster + logbuch feed already read
 * for co-members (see sharing.ts `profilesById`, home.ts `actorProfiles`).
 *
 * Read-only for now: the Profil page renders the real identity. A write path
 * (display-name / avatar edit) lands later and would invalidate `myProfileKey`.
 */

export const myProfileKey = (userId: string) => ["profile", userId] as const;

export interface MyProfile {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** ISO timestamp once the first-login /setup flow is done; null = not yet
   *  onboarded (the AppLayout gate routes such users to /setup). */
  onboardedAt: string | null;
}

export function myProfileOptions(user: User) {
  return {
    queryKey: myProfileKey(user.id),
    staleTime: 60_000,
    queryFn: async (): Promise<MyProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url, onboarded_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("profile lookup failed", error);
        return null;
      }
      if (!data) return null;
      return {
        userId: data.user_id as string,
        username: (data.username as string | null) ?? null,
        displayName: (data.display_name as string | null) ?? null,
        avatarUrl: (data.avatar_url as string | null) ?? null,
        onboardedAt: (data.onboarded_at as string | null) ?? null,
      };
    },
  };
}

/**
 * Result of a profile write. `blocked` distinguishes an RLS-silently-dropped
 * update (0 rows, no error) from a legitimately-null persisted value — for
 * display_name, null is a valid result (the user cleared it), so we can't use
 * null-as-block-sentinel the way EditableListName does for list names.
 */
export interface UpdateProfileResult {
  blocked: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

async function writeProfile(
  userId: string,
  patch: { display_name?: string | null; avatar_url?: string | null },
): Promise<UpdateProfileResult> {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("display_name, avatar_url");
  if (error) throw error;
  if (!data || data.length === 0)
    return { blocked: true, displayName: null, avatarUrl: null };
  return {
    blocked: false,
    displayName: (data[0].display_name as string | null) ?? null,
    avatarUrl: (data[0].avatar_url as string | null) ?? null,
  };
}

/** Write profiles.display_name (self only; profiles_update_own RLS). Empty
 *  string → null (clears it; the UI then falls back to the @handle). */
export function updateDisplayName(input: {
  userId: string;
  displayName: string | null;
}): Promise<UpdateProfileResult> {
  return writeProfile(input.userId, { display_name: input.displayName });
}

/** Write profiles.avatar_url (self only). */
export function updateAvatarUrl(input: {
  userId: string;
  avatarUrl: string | null;
}): Promise<UpdateProfileResult> {
  return writeProfile(input.userId, { avatar_url: input.avatarUrl });
}

export const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10 MB (cropper recompresses)

/**
 * Upload an image to the `avatars` bucket and return its public URL.
 *
 * Stable path `<uid>/avatar.<ext>` with upsert, so a re-upload overwrites in
 * place (no orphaned files). getPublicUrl yields a canonical, cache-friendly
 * URL — we append `?v=<ts>` so the browser + co-members fetch the new image
 * instead of the cached old one. Requires the avatars bucket + storage RLS
 * from migration 20260530150000.
 */
export async function uploadAvatar(input: {
  userId: string;
  file: File;
}): Promise<string> {
  const ext = (input.file.name.split(".").pop() || "png")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const path = `${input.userId}/avatar.${ext || "png"}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, input.file, {
      upsert: true,
      contentType: input.file.type || "image/png",
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Delete the signed-in user's account (delete_account RPC, migration
 * 20260530160000). Throws `owns_shared_lists` (Postgres errcode P0001) if the
 * caller still owns a list with other members — the UI blocks this case up
 * front, but we surface it for the defensive path. On success the auth.users
 * row is gone; the caller should signOut + redirect.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_account");
  if (error) throw error;
}

// ──────────────────────────────────────────────────────────────────────────
// Onboarding (first-login /setup flow)
// ──────────────────────────────────────────────────────────────────────────

export interface UsernameCheck {
  available: boolean;
  /** "invalid" (bad shape) | "taken" — present only when unavailable. */
  error?: "invalid" | "taken";
  /** The normalized (lowercased, @-stripped) handle when available. */
  normalized?: string;
}

/** Live availability check for an @handle. profiles RLS hides other users'
 *  rows, so this routes through the SECURITY DEFINER `username_available` RPC
 *  (migration 20260601100000). Debounce the caller — one call per settled
 *  input, not per keystroke. */
export async function checkUsernameAvailable(
  username: string,
): Promise<UsernameCheck> {
  const { data, error } = await supabase.rpc("username_available", {
    _username: username,
  });
  if (error) throw error;
  return data as UsernameCheck;
}

export interface SetUsernameResult {
  ok: boolean;
  /** "invalid" | "taken" | "blocked" (RLS) when !ok. */
  error?: "invalid" | "taken" | "blocked";
}

/** Persist a chosen @handle on the caller's own profile. Normalizes to the
 *  stored shape (lowercase, no leading @), validates the shape client-side,
 *  and leans on the UNIQUE(username) constraint to settle the race a live
 *  availability check can't close — a 23505 comes back as `taken`. */
export async function setUsername(input: {
  userId: string;
  username: string;
}): Promise<SetUsernameResult> {
  const norm = input.username.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(norm)) return { ok: false, error: "invalid" };

  const { data, error } = await supabase
    .from("profiles")
    .update({ username: norm })
    .eq("user_id", input.userId)
    .select("username");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "taken" };
    throw error;
  }
  if (!data || data.length === 0) return { ok: false, error: "blocked" };
  return { ok: true };
}

/** Stamp onboarded_at = now() — marks the /setup flow complete so the
 *  AppLayout gate stops routing the user to /setup. Self-update (RLS). */
export async function completeOnboarding(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("onboarded_at");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("blocked");
}
