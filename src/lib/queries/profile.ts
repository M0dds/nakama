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
}

export function myProfileOptions(user: User) {
  return {
    queryKey: myProfileKey(user.id),
    staleTime: 60_000,
    queryFn: async (): Promise<MyProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar_url")
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
