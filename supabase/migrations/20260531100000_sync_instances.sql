-- ============================================================================
-- Nakama · Sync-Instances — progress is global per user UNTIL an item is synced
-- in a list, then that list_item becomes a separate "instance" that starts at 0.
--
-- Run in Supabase Dashboard → SQL Editor AFTER all earlier migrations.
-- ADDITIVE + low-risk: adds a nullable `list_item_id` to episode_watches; every
-- existing row stays NULL (= global). No data is expanded or deleted.
--
--   list_item_id IS NULL      → global progress (default, today's behavior)
--   list_item_id = <li.id>    → that list_item's sync instance
--
-- Model:
--   • Global tick (no list / non-synced list): own row, list_item_id NULL, NO fan-out.
--   • Instance tick (synced list): own row tagged with the list_item + fan-out to
--     that list's members. Sync now means a FRESH shared watch-through from 0.
--   • Un-sync: union the instance rows back into each member's global progress,
--     then drop the instance rows (Auto-Merge — never loses progress, no prompt).
--
-- SHARED-DB NOTE (Logbook lives on the same project): this migration does NOT
-- change Logbook's write RPCs (toggle_episode_synced / mark_episodes_watched /
-- mark_episodes_watched_synced) — they keep writing NULL (global) rows, which is
-- correct. The GLOBAL read RPCs get a `list_item_id IS NULL` filter so neither
-- app counts instance rows as global progress (no-op on existing all-NULL data).
--
-- STILL TODO in the frontend session (NOT in this file): reshape the Home read
-- RPCs continue_watching / home_new_releases / home_watch_bundles to (a) filter
-- `list_item_id IS NULL` for their global parts AND (b) emit extra per-instance
-- entries. Frontend then calls the NEW write RPCs below with an optional
-- _list_item_id, and drops the sync-enable backfill (instances start empty).
-- ============================================================================

-- =========================================================================
-- 1. Schema — additive column + partial unique indexes
-- =========================================================================
alter table public.episode_watches
  add column if not exists list_item_id uuid
    references public.list_items(id) on delete cascade;

-- Drop the old UNIQUE(user_id, episode_id) by whatever name Postgres gave it
-- (so a global row + instance rows for the same (user, episode) can coexist).
do $$
declare _c text;
begin
  select con.conname into _c
  from pg_constraint con
  where con.conrelid = 'public.episode_watches'::regclass
    and con.contype = 'u'
    and (
      select array_agg(att.attname order by att.attname)
      from unnest(con.conkey) as k(attnum)
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = k.attnum
    ) = array['episode_id','user_id']
  limit 1;
  if _c is not null then
    execute format('alter table public.episode_watches drop constraint %I', _c);
  end if;
end $$;

-- Exactly one global row per (user, episode); instance rows keyed incl. list_item.
create unique index if not exists episode_watches_global_uniq
  on public.episode_watches (user_id, episode_id)
  where list_item_id is null;
create unique index if not exists episode_watches_instance_uniq
  on public.episode_watches (user_id, list_item_id, episode_id)
  where list_item_id is not null;
-- Instance reads (per-list_item progress, co-watcher count within a list).
create index if not exists episode_watches_listitem_idx
  on public.episode_watches (list_item_id, episode_id)
  where list_item_id is not null;

-- =========================================================================
-- 2. RLS — global rows stay co-member-visible (the "who's how far" view);
--    instance rows visible to members of that list_item's list.
-- =========================================================================
-- Definer helper: is _user_id a member of the list owning _list_item_id?
create or replace function public.is_list_item_member(_list_item_id uuid, _user_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1
    from public.list_items li
    join public.list_members lm on lm.list_id = li.list_id and lm.user_id = _user_id
    where li.id = _list_item_id
  );
$$;

drop policy if exists "episode_watches_select_co" on public.episode_watches;
create policy "episode_watches_select_co" on public.episode_watches for select to authenticated
  using (
    user_id = auth.uid()
    or (list_item_id is null and public.is_co_member(episode_id, auth.uid()))
    or (list_item_id is not null and public.is_list_item_member(list_item_id, auth.uid()))
  );

-- Direct client writes (backstop — Nakama writes via the definer RPCs below):
-- own rows only; an instance row only into a list you belong to.
drop policy if exists "episode_watches_insert_own" on public.episode_watches;
create policy "episode_watches_insert_own" on public.episode_watches for insert to authenticated
  with check (
    user_id = auth.uid()
    and (list_item_id is null or public.is_list_item_member(list_item_id, auth.uid()))
  );
drop policy if exists "episode_watches_update_own" on public.episode_watches;
create policy "episode_watches_update_own" on public.episode_watches for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "episode_watches_delete_own" on public.episode_watches;
create policy "episode_watches_delete_own" on public.episode_watches for delete to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- 3. Global read RPCs — scope to NULL rows so instances don't leak in
--    (no-op on existing all-NULL data; protects Nakama AND Logbook).
-- =========================================================================
create or replace function public.item_progress(_item_ids uuid[])
returns table (item_id uuid, total int, watched int)
language sql stable security invoker set search_path = public
as $$
  select
    e.item_id,
    count(*)::int as total,
    count(ew.episode_id)::int as watched
  from public.episodes e
  left join public.episode_watches ew
    on ew.episode_id = e.id
   and ew.user_id = auth.uid()
   and ew.list_item_id is null
  where e.item_id = any(_item_ids)
  group by e.item_id;
$$;

-- =========================================================================
-- 4. Per-list_item progress — the badge/progress source for list rows + the
--    list-scoped item page. Synced list_item → instance rows; else global.
-- =========================================================================
create or replace function public.list_item_progress(_list_item_ids uuid[])
returns table (list_item_id uuid, item_id uuid, total int, watched int)
language sql stable security invoker set search_path = public
as $$
  select
    li.id,
    li.item_id,
    count(e.id)::int as total,
    count(ew.episode_id)::int as watched
  from public.list_items li
  join public.episodes e on e.item_id = li.item_id
  left join public.episode_watches ew
    on ew.episode_id = e.id
   and ew.user_id = auth.uid()
   and case when li.sync_enabled
            then ew.list_item_id = li.id
            else ew.list_item_id is null end
  where li.id = any(_list_item_ids)
  group by li.id, li.item_id;
$$;
grant execute on function public.list_item_progress(uuid[]) to authenticated;

-- =========================================================================
-- 5. Write RPCs (instance-aware) — NEW names so Logbook's RPCs stay untouched.
--    _list_item_id NULL → global (own row, no fan-out).
--    _list_item_id set + sync_enabled → instance (own row tagged + fan-out to
--      that list's members).
--    _list_item_id set + NOT sync_enabled → treated as global (own NULL row),
--      so the list-scoped item page can always pass its list_item_id safely.
-- =========================================================================

-- 5a. Single-episode toggle.
create or replace function public.set_episode_watch(
  _item_id uuid,
  _episode_id uuid,
  _watched boolean,
  _list_item_id uuid default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _sync boolean := false;
  _list_id uuid;
  _eff_li uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.episodes where id = _episode_id and item_id = _item_id
  ) then
    raise exception 'episode % does not belong to item %', _episode_id, _item_id;
  end if;

  if _list_item_id is not null then
    select li.sync_enabled, li.list_id into _sync, _list_id
    from public.list_items li
    where li.id = _list_item_id and li.item_id = _item_id;
    if _list_id is null then
      raise exception 'list_item % not found for item %', _list_item_id, _item_id;
    end if;
    if not public.is_list_member(_list_id, _uid) then
      raise exception 'not a member of list %', _list_id;
    end if;
  end if;
  _eff_li := case when _sync then _list_item_id else null end;

  if _watched then
    insert into public.episode_watches (user_id, episode_id, list_item_id)
    values (_uid, _episode_id, _eff_li)
    on conflict do nothing;

    if _sync then
      insert into public.episode_watches (user_id, episode_id, list_item_id)
      select lm.user_id, _episode_id, _list_item_id
      from public.list_members lm
      where lm.list_id = _list_id
      on conflict do nothing;
    end if;
  else
    delete from public.episode_watches
    where episode_id = _episode_id
      and user_id = _uid
      and list_item_id is not distinct from _eff_li;

    if _sync then
      delete from public.episode_watches ew
      using public.list_members lm
      where lm.list_id = _list_id
        and ew.user_id = lm.user_id
        and ew.episode_id = _episode_id
        and ew.list_item_id = _list_item_id;
    end if;
  end if;
end;
$$;
grant execute on function public.set_episode_watch(uuid, uuid, boolean, uuid) to authenticated;

-- 5b. Cascade ("bis hier alles").
create or replace function public.mark_episodes_watched_upto(
  _item_id uuid,
  _up_to_episode_id uuid,
  _list_item_id uuid default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _ts int; _te int;
  _sync boolean := false;
  _list_id uuid;
  _eff_li uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select season_number, episode_number into _ts, _te
  from public.episodes where id = _up_to_episode_id and item_id = _item_id;
  if not found then
    raise exception 'episode % not found for item %', _up_to_episode_id, _item_id;
  end if;

  if _list_item_id is not null then
    select li.sync_enabled, li.list_id into _sync, _list_id
    from public.list_items li
    where li.id = _list_item_id and li.item_id = _item_id;
    if _list_id is null then
      raise exception 'list_item % not found for item %', _list_item_id, _item_id;
    end if;
    if not public.is_list_member(_list_id, _uid) then
      raise exception 'not a member of list %', _list_id;
    end if;
  end if;
  _eff_li := case when _sync then _list_item_id else null end;

  insert into public.episode_watches (user_id, episode_id, list_item_id)
  select _uid, e.id, _eff_li
  from public.episodes e
  where e.item_id = _item_id
    and (e.season_number, e.episode_number) <= (_ts, _te)
    and (e.air_date is null or e.air_date <= now())
  on conflict do nothing;

  if _sync then
    insert into public.episode_watches (user_id, episode_id, list_item_id)
    select lm.user_id, e.id, _list_item_id
    from public.episodes e
    cross join public.list_members lm
    where e.item_id = _item_id
      and lm.list_id = _list_id
      and (e.season_number, e.episode_number) <= (_ts, _te)
      and (e.air_date is null or e.air_date <= now())
    on conflict do nothing;
  end if;
end;
$$;
grant execute on function public.mark_episodes_watched_upto(uuid, uuid, uuid) to authenticated;

-- 5c. Reset (caller-only, like reset_item_progress). Global or one instance.
create or replace function public.reset_progress(
  _item_id uuid,
  _list_item_id uuid default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _sync boolean := false;
  _list_id uuid;
  _eff_li uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  if _list_item_id is not null then
    select li.sync_enabled, li.list_id into _sync, _list_id
    from public.list_items li
    where li.id = _list_item_id and li.item_id = _item_id;
    if _list_id is null then
      raise exception 'list_item % not found for item %', _list_item_id, _item_id;
    end if;
    if not public.is_list_member(_list_id, _uid) then
      raise exception 'not a member of list %', _list_id;
    end if;
  end if;
  _eff_li := case when _sync then _list_item_id else null end;

  delete from public.episode_watches ew
  using public.episodes e
  where ew.episode_id = e.id
    and e.item_id = _item_id
    and ew.user_id = _uid
    and ew.list_item_id is not distinct from _eff_li;
end;
$$;
grant execute on function public.reset_progress(uuid, uuid) to authenticated;

-- 5d. Un-sync — Auto-Merge: union instance rows into each member's global
--     progress (preserving watched_at), drop the instance, flip the flag.
--     SECURITY DEFINER: writes co-members' global rows.
create or replace function public.unsync_item(_list_item_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _list_id uuid;
begin
  if _uid is null then raise exception 'not authenticated'; end if;
  select list_id into _list_id from public.list_items where id = _list_item_id;
  if _list_id is null then raise exception 'list_item % not found', _list_item_id; end if;
  if not public.is_list_member(_list_id, _uid) then
    raise exception 'not a member of list %', _list_id;
  end if;

  -- Merge instance → global for every member (Union; never loses progress).
  insert into public.episode_watches (user_id, episode_id, watched_at, list_item_id)
  select ew.user_id, ew.episode_id, ew.watched_at, null
  from public.episode_watches ew
  where ew.list_item_id = _list_item_id
  on conflict do nothing;

  -- Tear down the instance.
  delete from public.episode_watches where list_item_id = _list_item_id;
  update public.list_items set sync_enabled = false where id = _list_item_id;
end;
$$;
grant execute on function public.unsync_item(uuid) to authenticated;
