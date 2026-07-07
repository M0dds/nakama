import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { relTime, unique } from "@/lib/format";

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
  /** Display label: display_name preferred, else @handle, else "Unbekannt". */
  name: string;
  /** "@username" when one exists, else null — the roster's secondary line
   *  (the invite/identify key, kept visible alongside the display name). */
  handle: string | null;
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
  /** Invitee's profile picture (joined server-side — see get_list_invitations;
   *  null → Avatar falls back to the initial). */
  inviteeAvatarUrl: string | null;
  createdAt: string;
}

/** Sync context for an item opened from a specific list_item. Drives the
 *  "Mit Mitgliedern synchronisieren"-toggle on the item page. */
export interface SyncContext {
  listItemId: string;
  listId: string;
  listName: string;
  syncEnabled: boolean;
  /** Group-shared display-weekday override for this synced instance
   *  (0=Sun..6=Sat, Date.getDay()), or null = none. Only meaningful when
   *  syncEnabled — a non-synced item uses the per-user global override instead. */
  displayWeekday: number | null;
  /** True once the list has been shared (invite sent / someone joined). */
  isShared: boolean;
  /** Members incl. the owner. >1 means real co-members have actually joined —
   *  only then is the sync toggle meaningful. */
  memberCount: number;
}

/** Who, among the caller's co-members, has watched a given episode. */
export interface CoWatcher {
  userId: string;
  /** Display name preferred, else @handle, else "Jemand". */
  name: string;
  /** Bare "@username" (or null) for the hover identity card (UserChip). */
  handle: string | null;
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
export const syncedListsForItemKey = (itemId: string) =>
  ["synced-lists", itemId] as const;

// ──────────────────────────────────────────────────────────────────────────
// Profile resolution — handle + avatar in one batched lookup. Mirrors home.ts
// `profileNames` but also carries avatar_url for the roster + co-watcher UI.
// ──────────────────────────────────────────────────────────────────────────

export interface ProfileBits {
  /** Display label: display_name preferred, else @handle, else null. */
  name: string | null;
  /** "@username" if a username exists, else null. */
  handle: string | null;
  avatarUrl: string | null;
}

/** Batch-resolve profiles by user_id → {name, handle, avatar}. Shared across
 *  sharing.ts (roster/co-watchers) and lists.ts (per-list member avatars). */
export async function profilesById(
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
    const atHandle = username ? `@${username}` : null;
    map.set(p.user_id as string, {
      // Display name preferred app-wide; @handle is the fallback + roster id.
      name: displayName ?? atHandle,
      handle: atHandle,
      avatarUrl: (p.avatar_url as string | null) ?? null,
    });
  }
  return map;
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
            name: p?.name ?? "Unbekannt",
            handle: p?.handle ?? null,
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
          | {
              invitation_id: string;
              invitee_name: string;
              invitee_avatar_url: string | null;
              created_at: string;
            }[]
          | null) ?? []
      ).map((r) => ({
        invitationId: r.invitation_id,
        inviteeName: r.invitee_name,
        inviteeAvatarUrl: r.invitee_avatar_url ?? null,
        createdAt: r.created_at,
      }));
    },
  };
}

export const listItemByContextKey = (
  shortCode: string,
  type: string,
  slug: string,
) => ["list-item-by-context", shortCode, type, slug] as const;

/** Resolve a (list shortCode, item type, item slug) triple → the list_item id.
 *  The list-scoped item page (`/lists/:shortCode/item/:type/:slug`) uses this to
 *  recover its list context on a cold load / reload, where there's no router
 *  link-state to carry the id. Null when the item isn't in that list or the
 *  list/item isn't visible (RLS). */
export function listItemByContextOptions(
  shortCode: string,
  type: string,
  slug: string,
) {
  return {
    queryKey: listItemByContextKey(shortCode, type, slug),
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("list_items")
        .select("id, lists!inner(short_code), items!inner(type, slug)")
        .eq("lists.short_code", shortCode)
        .eq("items.type", type)
        .eq("items.slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data?.id as string | undefined) ?? null;
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
        .select("id, sync_enabled, list_id, display_weekday")
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
        displayWeekday: (li.display_weekday as number | null) ?? null,
        isShared: list.is_shared as boolean,
        memberCount: count ?? 1,
      };
    },
  };
}

/** One synced instance of an item, as seen from the caller's lists. Carries
 *  the list's cover, the instance progress and the member faces so the item
 *  page's "Gesynct in" section can render the lists in the overview's row
 *  idiom. */
export interface SyncedListRef {
  listItemId: string;
  shortCode: string;
  name: string;
  coverUrl: string | null;
  coverSeed: number;
  /** Instance-lane progress (list_item_progress RPC — the caller's rows in
   *  the shared lane, which the sync fan-out keeps identical for members). */
  watched: number;
  total: number;
  members: ProfileBits[];
}

/** Synced instances of an item across the caller's (member-)lists — powers the
 *  GLOBAL item page's "Gesynct in" section: the context-free route reads the
 *  global lane, so if the item is actually watched as a synced instance, the
 *  page says so and links over. RLS scopes list_items to lists the caller
 *  belongs to, so this never reveals foreign lists. */
export function syncedListsForItemOptions(itemId: string) {
  return {
    queryKey: syncedListsForItemKey(itemId),
    staleTime: 60_000,
    queryFn: async (): Promise<SyncedListRef[]> => {
      const { data, error } = await supabase
        .from("list_items")
        .select(
          "id, list_id, lists!inner(short_code, name, cover_url, cover_seed)",
        )
        .eq("item_id", itemId)
        .eq("sync_enabled", true);
      if (error) {
        console.error("synced-lists lookup failed", error);
        return [];
      }
      const rows = (data ?? []).flatMap((r) => {
        const l = r.lists as unknown as {
          short_code: string;
          name: string;
          cover_url: string | null;
          cover_seed: number;
        } | null;
        return l
          ? [
              {
                listItemId: r.id as string,
                listId: r.list_id as string,
                shortCode: l.short_code,
                name: l.name,
                coverUrl: l.cover_url ?? null,
                coverSeed: l.cover_seed,
              },
            ]
          : [];
      });
      if (rows.length === 0) return [];

      // Instance progress (lane-aware RPC, head-count-style — cap-immune) +
      // the member roster of each list, batched.
      const [progressRes, membersRes] = await Promise.all([
        supabase.rpc("list_item_progress", {
          _list_item_ids: rows.map((r) => r.listItemId),
        }),
        supabase
          .from("list_members")
          .select("list_id, user_id")
          .in(
            "list_id",
            unique(rows.map((r) => r.listId)),
          ),
      ]);
      const progress = new Map<string, { watched: number; total: number }>();
      for (const p of (progressRes.data ?? []) as {
        list_item_id: string;
        total: number;
        watched: number;
      }[]) {
        progress.set(p.list_item_id, { watched: p.watched, total: p.total });
      }
      const memberRows = (membersRes.data ?? []) as {
        list_id: string;
        user_id: string;
      }[];
      const profs = await profilesById(
        unique(memberRows.map((m) => m.user_id)),
      );
      const membersByList = new Map<string, ProfileBits[]>();
      for (const m of memberRows) {
        const p = profs.get(m.user_id);
        if (!p) continue;
        const arr = membersByList.get(m.list_id) ?? [];
        arr.push(p);
        membersByList.set(m.list_id, arr);
      }

      return rows.map((r) => ({
        listItemId: r.listItemId,
        shortCode: r.shortCode,
        name: r.name,
        coverUrl: r.coverUrl,
        coverSeed: r.coverSeed,
        watched: progress.get(r.listItemId)?.watched ?? 0,
        total: progress.get(r.listItemId)?.total ?? 0,
        members: membersByList.get(r.listId) ?? [],
      }));
    },
  };
}

/** Members of ONE list, minus the caller. The Mitseher eye is a per-list
 *  signal: it must reflect "how far the members of THIS shared list are",
 *  never every co-member across all the caller's lists — otherwise a co-member
 *  from some other shared list would leak their progress onto an item the
 *  caller is viewing through a private (or different) list. RLS scopes
 *  list_members to the caller's own lists, so this only resolves for lists the
 *  caller belongs to. */
async function listMemberIdsOf(
  listId: string,
  selfId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("list_members")
    .select("user_id")
    .eq("list_id", listId);
  return unique(
    (data ?? []).map((m) => m.user_id as string).filter((id) => id !== selfId),
  );
}

interface CoWatchRow {
  episode_id: string;
  user_id: string;
  watched_at: string;
}

/** Resolve raw co-watch rows → an episode_id-keyed CoWatcher map, batching the
 *  profile (handle + avatar) lookup for the per-item co-watcher query. */
async function buildCoWatcherMap(
  rows: CoWatchRow[],
): Promise<Record<string, CoWatcher[]>> {
  if (rows.length === 0) return {};
  const profs = await profilesById(unique(rows.map((r) => r.user_id)));
  const map: Record<string, CoWatcher[]> = {};
  for (const r of rows) {
    const p = profs.get(r.user_id);
    (map[r.episode_id] ??= []).push({
      userId: r.user_id,
      name: p?.name ?? "Jemand",
      handle: p?.handle ?? null,
      avatarUrl: p?.avatarUrl ?? null,
      timeLabel: relTime(r.watched_at),
    });
  }
  return map;
}

/**
 * Co-watchers per episode for ONE item, scoped to ONE shared list: who among
 * THAT list's members (besides the caller) has watched each episode and when.
 * Keyed by episode id so the item episode list can look up a row's watchers.
 *
 * The eye is a SHARED-LIST-ONLY signal: callers must only mount this when the
 * item is opened through a shared list (the item page gates on isShared), and
 * it reads only that list's members — never every co-member across all lists.
 * That keeps a private (or different) list from revealing anyone else's
 * progress.
 *
 * Lane-matched to the item page (`instanceListItemId`): a non-synced shared
 * list reads co-members' GLOBAL progress (the "who's how far" eye); a synced
 * INSTANCE reads who's watched WITHIN that instance. The instance must NOT read
 * the global lane — otherwise a member's separate global progress would leak
 * onto a fresh shared instance that's supposed to start at 0.
 */
export function coWatchersOptions(
  user: User,
  itemId: string,
  listId: string,
  instanceListItemId: string | null = null,
  /** The episode ids of the CURRENTLY VISIBLE page of the item's episode list.
   *  The eye only ever renders for these rows, so we read co-watch state for
   *  just this window — never the whole show. */
  episodeIds: string[] = [],
) {
  return {
    queryKey: [
      ...coWatchersKey(itemId),
      listId,
      instanceListItemId,
      episodeIds,
    ] as const,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, CoWatcher[]>> => {
      if (episodeIds.length === 0) return {};
      // PRIVACY BOUNDARY: scope to THIS list's members only, and bail when
      // there are none. episode_watches RLS is stricter server-side, but do
      // NOT drop this `.in("user_id", memberIds)` — it's the guarantee that a
      // shared list never surfaces a non-member's progress.
      const memberIds = await listMemberIdsOf(listId, user.id);
      if (memberIds.length === 0) return {};

      // Scope to the visible episode window (≤ EPISODE_PAGE_SIZE × members rows)
      // instead of fetching every watch for the show. Supabase enforces a hard
      // 1000-row cap that overrides an explicit `.limit()`, so the old
      // fetch-the-whole-show query silently truncated the eye at episode 1000 on
      // long-running shows (One Piece). Per-page reads can never hit that cap.
      // The episode ids come from the item's own episode list, so they're
      // already item-scoped — no item join needed.
      const base = supabase
        .from("episode_watches")
        .select("episode_id, user_id, watched_at")
        .in("episode_id", episodeIds)
        .in("user_id", memberIds);
      const scoped = instanceListItemId
        ? base.eq("list_item_id", instanceListItemId)
        : base.is("list_item_id", null);
      const { data, error } = await scoped;
      if (error) {
        console.error("co-watchers lookup failed", error);
        return {};
      }
      return buildCoWatcherMap((data as unknown as CoWatchRow[]) ?? []);
    },
  };
}

export const movieCoWatchersKey = (itemId: string) =>
  ["movie-co-watchers", itemId] as const;

/**
 * Co-watchers for ONE film, scoped to ONE shared list: who among that list's
 * members (besides the caller) has marked the film seen, and when. Films are
 * episode-less, so this reads item_history (status='completed') instead of
 * episode_watches, and returns a flat CoWatcher[] (no per-episode keying).
 *
 * Same shared-list-only privacy as the episode eye: mount only when the film
 * is opened through a shared list, and read only THAT list's members. There's
 * no lane (films have no sync instances), so it always reads the single
 * item_history row per member. The RLS policy item_history_select_co
 * (shares_list_with) is what lets co-members' rows be visible at all.
 */
export function movieCoWatchersOptions(
  user: User,
  itemId: string,
  listId: string,
) {
  return {
    queryKey: [...movieCoWatchersKey(itemId), listId] as const,
    staleTime: 30_000,
    queryFn: async (): Promise<CoWatcher[]> => {
      // PRIVACY BOUNDARY (load-bearing): item_history's RLS policy
      // (item_history_select_co / shares_list_with) is deliberately BROAD — it
      // lets you read any co-member's full seen-state across all items. The
      // per-list guarantee lives ONLY in this `.in("user_id", memberIds)`
      // scope + the empty-member bail below. A future query that reads
      // item_history without this scope would leak others' progress. Do not
      // remove. (Tightening the RLS itself is a migration — see HEALTH.md.)
      const memberIds = await listMemberIdsOf(listId, user.id);
      if (memberIds.length === 0) return [];

      const { data, error } = await supabase
        .from("item_history")
        .select("user_id, updated_at")
        .eq("item_id", itemId)
        .eq("status", "completed")
        .in("user_id", memberIds);
      if (error) {
        console.error("movie co-watchers lookup failed", error);
        return [];
      }
      const rows = (data ?? []) as { user_id: string; updated_at: string }[];
      if (rows.length === 0) return [];

      const profs = await profilesById(unique(rows.map((r) => r.user_id)));
      return rows.map((r) => {
        const p = profs.get(r.user_id);
        return {
          userId: r.user_id,
          name: p?.name ?? "Jemand",
          handle: p?.handle ?? null,
          avatarUrl: p?.avatarUrl ?? null,
          timeLabel: relTime(r.updated_at),
        };
      });
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

/** Leave a list — via the `leave_list` DEFINER RPC, NOT a bare list_members
 *  DELETE: leaving must union-merge the caller's sync-instance progress back
 *  into their global lane first (migration 20260703100000). A bare delete
 *  stranded that progress AND left ghost "Jemand" activity in the remaining
 *  members' Logbuch. The owner can't leave; they transfer ownership or delete
 *  the list instead (gated in the UI, re-asserted in the RPC). Raise-on-deny,
 *  so no `.select()` null-check is needed. */
export async function leaveList(input: {
  listId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("leave_list", {
    _list_id: input.listId,
  });
  if (error) throw error;
}

/** Remove another member — owner-only (PRELAUNCH-2), via the
 *  `remove_list_member` DEFINER RPC for the same merge-before-delete reason
 *  as leaveList (the REMOVED member's instance progress must survive). */
export async function removeMember(input: {
  listId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("remove_list_member", {
    _list_id: input.listId,
    _member: input.userId,
  });
  if (error) throw error;
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
 * Toggle a list_item's per-item sync flag (sync-instances model).
 *
 *   enable  → just flip sync_enabled=true. The instance starts EMPTY (0) — no
 *             backfill of existing watches (this replaces the old union via
 *             backfill_sync_for_list_item). From here, ticks write instance
 *             rows that fan out to the list's members: a fresh shared watch-
 *             through. Late joiners inherit the current instance state.
 *   disable → unsync_item RPC: unions the instance rows back into every
 *             member's GLOBAL progress (Auto-Merge — never loses progress) and
 *             tears the instance down. Can't be a plain UPDATE since it writes
 *             co-members' rows, so it goes through the SECURITY DEFINER RPC.
 *
 * On enable the `.select()` detects a silent RLS block (0 rows, no error).
 */
export async function setItemSync(input: {
  listItemId: string;
  enabled: boolean;
}): Promise<void> {
  if (input.enabled) {
    const { data, error } = await supabase
      .from("list_items")
      .update({ sync_enabled: true })
      .eq("id", input.listItemId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (data === null)
      throw new Error("Synchronisierung konnte nicht geändert werden.");
  } else {
    const { error } = await supabase.rpc("unsync_item", {
      _list_item_id: input.listItemId,
    });
    if (error) throw error;
  }
}
