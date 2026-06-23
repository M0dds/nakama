-- ============================================================================
-- Display weekday — a per-lane "show new episodes on this weekday" override.
-- ============================================================================
-- Run in Supabase Dashboard → SQL Editor → New Query → Run. Idempotent.
--
-- WHY. Episode dates come from the source (TMDB/AniList) as the ORIGINAL air
-- date. For German viewers the real availability often lands a day later (e.g.
-- "From" airs US-Sunday but drops here Monday), and a group may only watch on a
-- fixed night ("wir schauen freitags"). This lets a user snap an item's
-- displayed dates ("Was kommt", calendar, badge, detail) to a chosen weekday —
-- the first such weekday on/after the real release.
--
-- WEEKDAY CONVENTION: 0=Sunday .. 6=Saturday — JS Date.getDay(), so the client
-- snap math is native. NULL / no row = no override (show the real date). The UI
-- maps these to Monday-first labels explicitly.
--
-- LANES (mirrors the sync-instance model of episode_watches):
--   • Global lane  → per-USER override, stored in item_display_prefs
--     (your private/non-synced tracking of the item, app-wide for you only —
--      NOT shared with other users).
--   • Sync instance → per-INSTANCE override, shared by the whole group, stored
--     on list_items.display_weekday (one value per synced list_item, all
--     members see the same — "the group watches Fridays").
-- ============================================================================

-- ── Global lane: per-user override ─────────────────────────────────────────
create table if not exists public.item_display_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  -- 0=Sunday .. 6=Saturday (Date.getDay()).
  weekday smallint not null check (weekday between 0 and 6),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.item_display_prefs enable row level security;

-- Own rows only — a display pref is private to the user (global lane).
drop policy if exists "item_display_prefs_select_own" on public.item_display_prefs;
create policy "item_display_prefs_select_own" on public.item_display_prefs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "item_display_prefs_insert_own" on public.item_display_prefs;
create policy "item_display_prefs_insert_own" on public.item_display_prefs for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "item_display_prefs_update_own" on public.item_display_prefs;
create policy "item_display_prefs_update_own" on public.item_display_prefs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "item_display_prefs_delete_own" on public.item_display_prefs;
create policy "item_display_prefs_delete_own" on public.item_display_prefs for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.item_display_prefs to authenticated;

-- updated_at trigger (set_updated_at exists from the Logbook core schema).
drop trigger if exists on_item_display_prefs_updated on public.item_display_prefs;
create trigger on_item_display_prefs_updated
  before update on public.item_display_prefs
  for each row execute function public.set_updated_at();

-- Live across the user's own devices (RLS still scopes rows to the caller).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'item_display_prefs'
  ) then
    alter publication supabase_realtime add table public.item_display_prefs;
  end if;
end $$;

-- ── Sync instance: group-shared override ───────────────────────────────────
-- One value per synced list_item, shared by all members. Only meaningful when
-- sync_enabled=true (a non-synced list_item's lane is the global per-user one).
alter table public.list_items
  add column if not exists display_weekday smallint
  check (display_weekday is null or display_weekday between 0 and 6);

-- Member-scoped setter. SECURITY DEFINER mirrors set_list_tracking/set_list_pin:
-- any member of the list owning the instance may set the shared weekday (it's a
-- group decision, like the synced progress it rides on). Pass NULL to clear.
-- Returns the new value, or raises when the caller isn't a member.
create or replace function public.set_instance_display_weekday(
  _list_item_id uuid,
  _weekday smallint
)
returns smallint
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    _list_id uuid;
    _result smallint;
  begin
    if _weekday is not null and (_weekday < 0 or _weekday > 6) then
      raise exception 'weekday out of range';
    end if;

    select li.list_id into _list_id
      from public.list_items li
     where li.id = _list_item_id;

    if _list_id is null then
      raise exception 'list item not found';
    end if;

    if not public.is_list_member(_list_id, auth.uid()) then
      raise exception 'access denied';
    end if;

    update public.list_items li
       set display_weekday = _weekday
     where li.id = _list_item_id
    returning li.display_weekday into _result;

    return _result;
  end;
  $function$;

grant execute on function public.set_instance_display_weekday(uuid, smallint) to authenticated;
