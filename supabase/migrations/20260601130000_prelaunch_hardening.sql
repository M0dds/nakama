-- Nakama · Pre-Launch RLS-Härtung (PRELAUNCH-1, PRELAUNCH-2, AUD-10, PRIV-3)
-- Run in Supabase Dashboard → SQL Editor → New Query → Run. Idempotent.
--
-- Context: open launch (strangers can sign up). Three audit findings hardened:
--   PRELAUNCH-1  items/episodes were world-writable → route catalog writes
--                through DEFINER RPCs + revoke direct table writes.
--   PRELAUNCH-2  any member could rename a list / kick others → owner-only.
--   AUD-10       item_history co-member read was too broad → require the item
--                to be co-present in a shared list.
--   PRIV-3       drop the redundant item_history_select_own (its self-clause
--                lives in _select_co). NOTE: profiles_select_own is NOT
--                redundant (profiles_select_co_member has no self-clause; a
--                listless user needs _own to read their own row) → left as-is.

-- ════════════════════════════════════════════════════════════════════════
-- Part A — PRELAUNCH-1: catalog writes via DEFINER RPCs
-- ════════════════════════════════════════════════════════════════════════

-- upsert_item: insert a new catalog row (all fields), or on (source,source_id)
-- conflict do a NO-OP update (preserve the first writer's title/cover/metadata/
-- slug) and return the existing id. The no-op `set source_id = excluded.source_id`
-- only exists to make RETURNING yield the row on conflict; the slug trigger is
-- BEFORE INSERT only, so it never re-fires here.
create or replace function public.upsert_item(
  _source text,
  _source_id text,
  _type text,
  _title text,
  _cover_url text,
  _metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  insert into public.items (source, source_id, type, title, cover_url, metadata)
  values (_source, _source_id, _type, _title, _cover_url, coalesce(_metadata, '{}'::jsonb))
  on conflict (source, source_id) do update set source_id = excluded.source_id
  returning id into _id;
  return _id;
end;
$$;

-- set_item_metadata: replace items.metadata wholesale (caller builds the merged
-- object, faithful to the prior client read-merge-write). Used by the film
-- release-date backfill + the episode-enrichment stamp.
create or replace function public.set_item_metadata(
  _item_id uuid,
  _metadata jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.items set metadata = coalesce(_metadata, '{}'::jsonb) where id = _item_id;
end;
$$;

-- upsert_episodes: bulk-upsert an episode list from a JSON array. coalesce on
-- the conflict update is load-bearing: the title-enrichment caller sends rows
-- WITHOUT air_date, so excluded.air_date is null — without coalesce that would
-- null out an existing air_date. Likewise a null title never clobbers a set one.
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
  on conflict (item_id, season_number, episode_number) do update
    set title = coalesce(excluded.title, episodes.title),
        air_date = coalesce(excluded.air_date, episodes.air_date);
end;
$$;

grant execute on function public.upsert_item(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.set_item_metadata(uuid, jsonb) to authenticated;
grant execute on function public.upsert_episodes(uuid, jsonb) to authenticated;

-- Lock down direct catalog writes. SELECT stays open (public read catalog).
drop policy if exists "items_insert_auth" on public.items;
drop policy if exists "items_update_auth" on public.items;
drop policy if exists "episodes_insert_auth" on public.episodes;
drop policy if exists "episodes_update_auth" on public.episodes;
revoke insert, update, delete on public.items from anon, authenticated;
revoke insert, update, delete on public.episodes from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- Part B — PRELAUNCH-2: owner-only rename + member removal
-- ════════════════════════════════════════════════════════════════════════

-- lists UPDATE (rename/description) → owner only. is_shared is only ever
-- toggled by DEFINER RPCs (invite_to_list / unshare_when_solo / unsync_item),
-- which bypass RLS, so this doesn't affect sharing.
drop policy if exists "lists_update_member" on public.lists;
drop policy if exists "lists_update_owner" on public.lists;
create policy "lists_update_owner" on public.lists for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- list_members DELETE → self-leave (non-owner) OR the owner removing someone
-- else. A non-owner can no longer kick other members.
drop policy if exists "list_members_delete_self_or_owner" on public.list_members;
drop policy if exists "list_members_delete_protect_owner" on public.list_members;
drop policy if exists "list_members_delete_owner_or_self" on public.list_members;
create policy "list_members_delete_owner_or_self" on public.list_members for delete to authenticated
  using (
    (user_id = auth.uid() and not public.is_list_owner(list_id, auth.uid()))
    or (public.is_list_owner(list_id, auth.uid()) and user_id <> auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════
-- Part C — AUD-10 + PRIV-3: tighten item_history co-member read
-- ════════════════════════════════════════════════════════════════════════

-- True iff _other and _me both belong to a list that contains _item_id — i.e.
-- the item is co-present in a shared list, not merely "we share some list".
create or replace function public.shares_item_in_list_with(
  _item_id uuid,
  _other uuid,
  _me uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.list_items li
    join public.list_members me on me.list_id = li.list_id and me.user_id = _me
    join public.list_members ot on ot.list_id = li.list_id and ot.user_id = _other
    where li.item_id = _item_id
  );
$$;

grant execute on function public.shares_item_in_list_with(uuid, uuid, uuid) to authenticated;

-- Replace the broad co-member read; drop the now-redundant own-only policy
-- (its self-clause is folded into _select_co below).
drop policy if exists "item_history_select_co" on public.item_history;
drop policy if exists "item_history_select_own" on public.item_history;
create policy "item_history_select_co" on public.item_history for select to authenticated
  using (
    user_id = auth.uid()
    or public.shares_item_in_list_with(item_id, user_id, auth.uid())
  );
