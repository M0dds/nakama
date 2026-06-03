-- Nakama · M-1: authorize the catalog-write DEFINER RPCs (security audit 2026-06-03)
-- Run in Supabase Dashboard → SQL Editor → New Query → Run. Idempotent.
--
-- Context: 20260601130000 (PRELAUNCH-1) revoked direct INSERT/UPDATE on the
-- world-readable items/episodes catalog and routed writes through SECURITY
-- DEFINER RPCs — but two of them, set_item_metadata + upsert_episodes, perform
-- the write with NO authorization check and are granted to `authenticated`. A
-- DEFINER function bypasses RLS, so any signed-in user could call them by id and
-- rewrite the metadata / episode titles / air-dates of ANY shared catalog item,
-- corrupting "Was kommt" / Kalender / Badges for every user (catalog vandalism;
-- no private data exposed). The dropped table policies used to provide the gate
-- implicitly — the RPCs faithfully reproduced the old open-write semantics
-- behind the definer boundary without re-adding scoping.
--
-- Fix: gate both writes on "the caller actually has this item in one of their
-- lists" via a new helper. Enrichment is idempotent + per-visit, so this costs
-- legitimate callers nothing (they always have the item in the list they're
-- viewing it through). upsert_item is left untouched — it is the INSERT path and
-- is already no-op-on-conflict, so it cannot clobber another writer's row.
--
-- DESIGN: the guard is a silent NO-OP, not a raised exception. The client's
-- episode-enrichment path (episodes.ts ensureEpisodes → storeEpisodes) calls
-- upsert_episodes and throws on RPC error WITHOUT a surrounding try/catch, so a
-- `raise exception` would break the episode page for the (rare, legitimate) case
-- of viewing an item via a deep link before it is in any of the viewer's lists.
-- A WHERE-gated write returns 0 rows + no error → the client continues happily,
-- enrichment is simply skipped for non-members. The security boundary still
-- holds: an unauthorized caller's write affects nothing.

-- ════════════════════════════════════════════════════════════════════════
-- Helper: may _uid write to the shared catalog row for _item_id?
-- True iff the item is present in a list the caller owns or is a member of.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.can_write_catalog_item(
  _item_id uuid,
  _uid uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.list_items li
    join public.lists l on l.id = li.list_id
    where li.item_id = _item_id
      and (l.owner_id = _uid or public.is_list_member(li.list_id, _uid))
  );
$$;

grant execute on function public.can_write_catalog_item(uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- set_item_metadata: wholesale metadata replace, now scoped to the caller.
-- Unchanged from 20260601130000 except the WHERE authorization clause.
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.set_item_metadata(
  _item_id uuid,
  _metadata jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.items
     set metadata = coalesce(_metadata, '{}'::jsonb)
   where id = _item_id
     and public.can_write_catalog_item(_item_id, auth.uid());
end;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- upsert_episodes: bulk episode upsert, now scoped to the caller. The WHERE
-- on the SELECT filters every row out when the caller is not authorized, so
-- nothing is inserted/updated (and ON CONFLICT never fires). coalesce on the
-- conflict update is preserved (a null title/air_date never clobbers a set one).
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.upsert_episodes(
  _item_id uuid,
  _rows jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.episodes (item_id, season_number, episode_number, title, air_date)
  select
    _item_id,
    coalesce((r->>'season_number')::int, 1),
    (r->>'episode_number')::int,
    r->>'title',
    (r->>'air_date')::timestamptz
  from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) r
  where public.can_write_catalog_item(_item_id, auth.uid())
  on conflict (item_id, season_number, episode_number) do update
    set title = coalesce(excluded.title, episodes.title),
        air_date = coalesce(excluded.air_date, episodes.air_date);
end;
$$;

grant execute on function public.set_item_metadata(uuid, jsonb) to authenticated;
grant execute on function public.upsert_episodes(uuid, jsonb) to authenticated;
