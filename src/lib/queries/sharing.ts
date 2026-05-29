import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { unique } from "@/lib/format";

/**
 * Sharing data layer — Phase 7. Typed query options + mutation functions for
 * list membership, invitations, per-item sync, and the co-watcher indicator.
 * Components call these via createQuery / createMutation, same as lists.ts.
 *
 * The backend (RPCs + RLS) already lives in the shared Supabase project (built
 * out in the Logbook era). This module is the Solid/TanStack port of Logbook's
 * `src/lib/sharing.ts`.
 *
 * Why some reads go through definer RPCs and not plain queries:
 *   - To invite someone you need their user_id, but profiles RLS only exposes
 *     your own row + co-members' rows — a not-yet-member invitee is invisible.
 *     invite_to_list resolves the @handle → user_id behind the definer boundary.
 *   - A pending invitee can't read the list name (lists RLS = members only) and
 *     the owner can't read the invitee's handle (not a co-member yet).
 *     get_my_invitations / get_list_invitations join the names server-side.
 * The member roster + co-watcher reads ARE plain queries: co-members may read
 * each other's profiles (profiles_select_co_member) once they've joined.
 */

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export interface ListMember {
  userId: string;
  /** "@alice" when a username exists, else the display name, else "Unbekannt". */
  handle: string;
  avatarUrl: string | null;
  role: "owner" | "member";
  isMe: boolean;
}

/** A pending invitation addressed to the current user (inbox view). */
export interface IncomingInvitation {
  invitationId: string;
  listId: string;
  listName: string;
  /** Inviter's "@handle" / display name / "Jemand". */
  inviterName: string;
  createdAt: string;
}

/** A list's outstanding invitation (owner view). */
export interface PendingInvitation {
  invitationId: string;
  inviteeName: string;
  createdAt: string;
}

/** Sync context for an item opened from a specific list_item. Drives the
 *  "Mit Mitgliedern synchronisieren"-toggle on the item page. */
export interface SyncContext {
  listItemId: string;
  listId: string;
  listName: string;
  syncEnabled: boolean;
  /** True once the list has been shared (invite sent / someone joined). */
  isShared: boolean;
  /** Members incl. the owner. >1 means real co-members have actually joined —
   *  only then is the sync toggle meaningful. */
  memberCount: number;
}

/** Who, among the caller's co-members, has watched a given episode. */
export interface CoWatcher {
  userId: string;
  /** "@handle" / display name / "Jemand". */
  name: string;
  avatarUrl: string | null;
  /** Pre-formatted relative time ("gestern", "vor 2 Std.", "12.05."). */
  timeLabel: string;
}

/** Discriminated result of invite_to_list — the RPC returns a json object so
 *  the UI can show a precise inline message instead of a thrown error. */
export type InviteResult =
  | { ok: true }
  | { ok: false; error: "empty" | "not_found" | "self" | "already_member" };

// ──────────────────────────────────────────────────────────────────────────
// Query keys — prefixes so realtime can invalidate without knowing the id at
// mount time (ListDetail's listId resolves async; a prefix invalidation hits
// whichever members/invitations query is currently mounted).
// ──────────────────────────────────────────────────────────────────────────

export const myInvitationsKey = (userId: string) =>
  ["invitations", "mine", userId] as const;
export const listMembersKey = (listId: string) =>
  ["list-members", listId] as const;
export const listInvitationsKey = (listId: string) =>
  ["list-invitations", listId] as const;
export const syncContextKey = (listItemId: string) =>
  ["sync-context", listItemId] as const;
export const coWatchersKey = (itemId: string) =>
  ["co-watchers", itemId] as const;

// ──────────────────────────────────────────────────────────────────────────
// Profile resolution — handle + avatar in one batched lookup. Mirrors home.ts
// `profileNames` but also carries avatar_url for the roster + co-watcher UI.
// ──────────────────────────────────────────────────────────────────────────

interface ProfileBits {
  handle: string;
  avatarUrl: string | null;
}

async function profilesById(
  ids: string[],
): Promise<Map<string, ProfileBits>> {
  const map = new Map<string, ProfileBits>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", ids);
  if (error) {
    console.error("profiles lookup failed", error);
    return map;
  }
  for (const p of data ?? []) {
    const username = p.username as string | null;
    const displayName = p.display_name as string | null;
    map.set(p.user_id as string, {
      handle: username ? `@${username}` : displayName ?? "Unbekannt",
      avatarUrl: (p.avatar_url as string | null) ?? null,
    });
  }
  return map;
}

/** Compact German relative time for a past timestamp. */
function relTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `vor ${diffHrs} Std.`;
  const days = Math.round(diffHrs / 24);
  if (days === 1) return "gestern";
  if (days <= 6) return `vor ${days} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Query options
// ──────────────────────────────────────────────────────────────────────────

/** Members of a list, owner first. RLS scopes list_members to lists the caller
 *  belongs to; profiles resolve via profiles_select_co_member. */
export function listMembersOptions(user: User, listId: string) {
  return {
    queryKey: listMembersKey(listId),
    staleTime: 60_000,
    queryFn: async (): Promise<ListMember[]> => {
      const { data: members, error } = await supabase
        .from("list_members")
        .select("user_id, role")
        .eq("list_id", listId);
      if (error) throw error;
      if (!members || members.length === 0) return [];

      const profs = await profilesById(
        members.map((m) => m.user_id as string),
      );

      return members
        .map((m) => {
          const id = m.user_id as string;
          const p = profs.get(id);
          return {
            userId: id,
            handle: p?.handle ?? "Unbekannt",
            avatarUrl: p?.avatarUrl ?? null,
            role: m.role as "owner" | "member",
            isMe: id === user.id,
          };
        })
        .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
    },
  };
}

/** Incoming pending invitations for the current user. Backs the /lists inbox
 *  cards AND the BottomNav count badge. */
export function myInvitationsOptions(user: User) {
  return {
    queryKey: myInvitationsKey(user.id),
    staleTime: 30_000,
    queryFn: async (): Promise<IncomingInvitation[]> => {
      const { data, error } = await supabase.rpc("get_my_invitations");
      if (error) throw error;
      return (
        (data as
          | {
              invitation_id: string;
              list_id: string;
              list_name: string;
              inviter_name: string;
              created_at: string;
            }[]
          | null) ?? []
      ).map((r) => ({
        invitationId: r.invitation_id,
        listId: r.list_id,
        listName: r.list_name,
        inviterName: r.inviter_name,
        createdAt: r.created_at,
      }));
    },
  };
}

/** A list's outstanding invitations (owner view — RPC returns nothing for
 *  non-owners). */
export function listInvitationsOptions(listId: string) {
  return {
    queryKey: listInvitationsKey(listId),
    staleTime: 30_000,
    queryFn: async (): Promise<PendingInvitation[]> => {
      const { data, error } = await supabase.rpc("get_list_invitations", {
        _list_id: listId,
      });
      if (error) throw error;
      return (
        (data as
          | { invitation_id: string; invitee_name: string; created_at: string }[]
          | null) ?? []
      ).map((r) => ({
        invitationId: r.invitation_id,
        inviteeName: r.invitee_name,
        createdAt: r.created_at,
      }));
    },
  };
}

/** Resolve a list_item → its list (name, shared flag, member count) so the item
 *  page can show the sync toggle. Null when the list_item isn't visible (RLS). */
export function syncContextOptions(listItemId: string) {
  return {
    queryKey: syncContextKey(listItemId),
    staleTime: 60_000,
    queryFn: async (): Promise<SyncContext | null> => {
      const { data: li, error: liErr } = await supabase
        .from("list_items")
        .select("id, sync_enabled, list_id")
        .eq("id", listItemId)
        .maybeSingle();
      if (liErr) throw liErr;
      if (!li) return null;

      const { data: list, error: lErr } = await supabase
        .from("lists")
        .select("name, is_shared")
        .eq("id", li.list_id as string)
        .maybeSingle();
      if (lErr) throw lErr;
      if (!list) return null;

      const { count } = await supabase
        .from("list_members")
        .select("*", { count: "exact", head: true })
        .eq("list_id", li.list_id as string);

      return {
        listItemId: li.id as string,
        listId: li.list_id as string,
        listName: list.name as string,
        syncEnabled: li.sync_enabled as boolean,
        isShared: list.is_shared as boolean,
        memberCount: count ?? 1,
      };
    },
  };
}

/**
 * Co-watchers per episode for one item: who, among the people the caller
 * actually shares a list with, has watched each episode and when. Keyed by
 * episode id so the episode list / day-pane can look up a row's watchers.
 * Empty map for the solo case — short-circuits before touching watches.
 */
export function coWatchersOptions(user: User, itemId: string) {
  return {
    queryKey: coWatchersKey(itemId),
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, CoWatcher[]>> => {
      // Everyone sharing a list with me (RLS scopes list_members to my lists),
      // minus myself.
      const { data: memberRows } = await supabase
        .from("list_members")
        .select("user_id");
      const coMemberIds = unique(
        (memberRows ?? [])
          .map((m) => m.user_id as string)
          .filter((id) => id !== user.id),
      );
      if (coMemberIds.length === 0) return {};

      const { data, error } = await supabase
        .from("episode_watches")
        .select("episode_id, user_id, watched_at, episodes!inner(item_id)")
        .eq("episodes.item_id", itemId)
        .in("user_id", coMemberIds)
        .order("watched_at", { ascending: false });
      if (error) {
        console.error("co-watchers lookup failed", error);
        return {};
      }
      const rows =
        (data as unknown as {
          episode_id: string;
          user_id: string;
          watched_at: string;
        }[]) ?? [];
      if (rows.length === 0) return {};

      const profs = await profilesById(unique(rows.map((r) => r.user_id)));

      const map: Record<string, CoWatcher[]> = {};
      for (const r of rows) {
        const p = profs.get(r.user_id);
        (map[r.episode_id] ??= []).push({
          userId: r.user_id,
          name: p?.handle ?? "Jemand",
          avatarUrl: p?.avatarUrl ?? null,
          timeLabel: relTime(r.watched_at),
        });
      }
      return map;
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────────────────

/** Invite by @handle. Owner-only (enforced server-side). Marks the list shared.
 *  Returns a discriminated result so the UI can show a precise inline message. */
export async function inviteToList(input: {
  listId: string;
  username: string;
}): Promise<InviteResult> {
  const { data, error } = await supabase.rpc("invite_to_list", {
    _list_id: input.listId,
    _username: input.username,
  });
  if (error) throw error;
  return data as InviteResult;
}

/** Accept an invitation — definer RPC flips status + inserts membership. */
export async function acceptInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("accept_list_invitation", {
    _invitation_id: invitationId,
  });
  if (error) throw error;
}

/** Decline — invitee UPDATEs their own invitation row to 'declined'
 *  (list_invitations_update_invitee). `.select()` surfaces a silent RLS
 *  block (0 rows, no error) as a thrown error. */
export async function declineInvitation(invitationId: string): Promise<void> {
  const { data, error } = await supabase
    .from("list_invitations")
    .update({ status: "declined" })
    .eq("id", invitationId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data === null)
    throw new Error("Einladung konnte nicht abgelehnt werden.");
}

/** Revoke a pending invitation — inviter DELETEs the row
 *  (list_invitations_delete_inviter). */
export async function revokeInvitation(invitationId: string): Promise<void> {
  const { data, error } = await supabase
    .from("list_invitations")
    .delete()
    .eq("id", invitationId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data === null)
    throw new Error("Einladung konnte nicht zurückgezogen werden.");
}

/** Leave a list — delete the caller's own membership row
 *  (list_members_delete_self_or_owner). The owner can't leave; they transfer
 *  ownership or delete the list instead (gated in the UI). */
export async function leaveList(input: {
  listId: string;
  userId: string;
}): Promise<void> {
  const { data, error } = await supabase
    .from("list_members")
    .delete()
    .eq("list_id", input.listId)
    .eq("user_id", input.userId)
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new Error("Liste konnte nicht verlassen werden.");
}

/** Transfer ownership to another member — definer RPC swaps owner_id + roles
 *  atomically. Owner-only; target must already be a member. */
export async function transferOwnership(input: {
  listId: string;
  newOwnerId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("transfer_list_ownership", {
    _list_id: input.listId,
    _new_owner_id: input.newOwnerId,
  });
  if (error) throw error;
}

/**
 * Toggle a list_item's per-item sync flag. On enable, retroactively unions all
 * members' existing watches via backfill_sync_for_list_item so both sides land
 * in lock-step (now AND in the past). On disable we leave watches untouched —
 * the flip-off path is deliberately non-destructive.
 *
 * `.select()` detects a silent RLS block (0 rows, no error).
 */
export async function setItemSync(input: {
  listItemId: string;
  enabled: boolean;
}): Promise<void> {
  const { data, error } = await supabase
    .from("list_items")
    .update({ sync_enabled: input.enabled })
    .eq("id", input.listItemId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data === null)
    throw new Error("Synchronisierung konnte nicht geändert werden.");

  if (input.enabled) {
    const { error: bfErr } = await supabase.rpc(
      "backfill_sync_for_list_item",
      { _list_item_id: input.listItemId },
    );
    if (bfErr) throw bfErr;
  }
}
