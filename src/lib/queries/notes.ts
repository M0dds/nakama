/**
 * Item notes — a shared notes board per (list, item). Each note is a BLOCK:
 * either free text or a named link (a label + a url, rendered as a clickable
 * pill). Shared with the members of the list the item is opened through (RLS:
 * is_list_member), so it's collaborative on a shared list and private on a
 * solo one. See migration 20260603100000_item_notes.
 *
 * Reads scope to (list_id, item_id) — RLS guarantees the caller is a member, so
 * no extra user filter is needed. Author profiles are batch-resolved for the
 * attribution shown on co-members' blocks.
 */
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { unique } from "@/lib/format";

export type NoteKind = "text" | "link";

export interface ItemNote {
  id: string;
  kind: NoteKind;
  /** Text block: the note text. Link block: the clickable label. */
  body: string;
  /** Link block only — the (normalized) target. Null for text blocks. */
  url: string | null;
  createdAt: string;
  authorUserId: string;
  isSelf: boolean;
  /** display_name ▸ @handle ▸ null — for the co-member attribution chip. */
  authorName: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
}

export const itemNotesKey = (listId: string, itemId: string) =>
  ["item-notes", listId, itemId] as const;

export function itemNotesOptions(user: User, listId: string, itemId: string) {
  return {
    queryKey: itemNotesKey(listId, itemId),
    queryFn: () => fetchItemNotes(user.id, listId, itemId),
    staleTime: 30_000,
  };
}

interface NoteRow {
  id: string;
  kind: NoteKind;
  body: string;
  url: string | null;
  author_user_id: string;
  created_at: string;
}

async function fetchItemNotes(
  currentUserId: string,
  listId: string,
  itemId: string,
): Promise<ItemNote[]> {
  const { data, error } = await supabase
    .from("item_notes")
    .select("id, kind, body, url, author_user_id, created_at")
    .eq("list_id", listId)
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as NoteRow[];
  if (rows.length === 0) return [];

  const authorIds = unique(
    rows.map((r) => r.author_user_id).filter((id) => id !== currentUserId),
  );
  const profiles = await profilesById(authorIds);

  return rows.map((r) => {
    const isSelf = r.author_user_id === currentUserId;
    const p = isSelf ? undefined : profiles.get(r.author_user_id);
    return {
      id: r.id,
      kind: r.kind,
      body: r.body,
      url: r.url,
      createdAt: r.created_at,
      authorUserId: r.author_user_id,
      isSelf,
      authorName: p?.name ?? null,
      authorHandle: p?.handle ?? null,
      authorAvatarUrl: p?.avatarUrl ?? null,
    };
  });
}

interface ProfileBits {
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
}

async function profilesById(ids: string[]): Promise<Map<string, ProfileBits>> {
  const map = new Map<string, ProfileBits>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", ids);
  if (error) {
    console.error("note author profiles lookup failed", error);
    return map;
  }
  for (const p of data ?? []) {
    const username = p.username as string | null;
    const displayName = p.display_name as string | null;
    const handle = username ? `@${username}` : null;
    map.set(p.user_id as string, {
      name: displayName ?? handle,
      handle,
      avatarUrl: (p.avatar_url as string | null) ?? null,
    });
  }
  return map;
}

// ── Mutations ─────────────────────────────────────────────────────────────
// All .select() after the write so a silent RLS block surfaces as a thrown
// error instead of a fake success (Logbook lesson).

export async function addTextNote(input: {
  user: User;
  listId: string;
  itemId: string;
  text: string;
}): Promise<void> {
  const { error } = await supabase
    .from("item_notes")
    .insert({
      list_id: input.listId,
      item_id: input.itemId,
      author_user_id: input.user.id,
      kind: "text",
      body: input.text,
    })
    .select();
  if (error) throw error;
}

export async function addLinkNote(input: {
  user: User;
  listId: string;
  itemId: string;
  label: string;
  url: string;
}): Promise<void> {
  const { error } = await supabase
    .from("item_notes")
    .insert({
      list_id: input.listId,
      item_id: input.itemId,
      author_user_id: input.user.id,
      kind: "link",
      body: input.label,
      url: input.url,
    })
    .select();
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("item_notes").delete().eq("id", id);
  if (error) throw error;
}

/** Returns a safe http(s) href, or null if the input isn't a valid web URL.
 *  Prepends https:// when no scheme is given; rejects non-web schemes
 *  (javascript:, data: …) so a link block can never become an XSS vector. */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
