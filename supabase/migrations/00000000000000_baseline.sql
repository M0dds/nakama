-- ============================================================================
-- Nakama · DB-Baseline — Sicherheits-Layer (Snapshot der Live-DB, 2026-06-04)
-- ============================================================================
-- SEC-BASELINE (Security-Audit I-1): Bis hierher lag das Sicherheits-Fundament
-- (SECURITY-DEFINER-Helfer + RPCs, RLS-Enablement, alle Policies, Trigger) nur
-- verstreut — teils im Schwester-Repo Logbook, teils ad-hoc im SQL-Editor — und
-- war aus diesem Repo allein NICHT reviewbar. Diese Datei ist der autoritative,
-- vollständige Snapshot dieses Layers, direkt aus der Live-DB gezogen
-- (Introspektion über pg_proc / pg_policy / pg_trigger), damit „so ist die App
-- abgesichert" an genau EINER Stelle nachlesbar ist.
--
-- WAS DRIN IST: alle public-Funktionen (CREATE OR REPLACE → idempotent), RLS-
-- Enablement je Tabelle, alle Policies, alle Trigger.
--
-- WAS NOCH FEHLT (bewusst): die TABELLEN-DDL selbst (CREATE TABLE …, Spalten,
-- Indizes, FKs, GRANTs). Die liegt weiterhin in der Logbook-Core-Migration +
-- den Nakama-ALTER-Migrationen. Diese Datei setzt also voraus, dass die Tabellen
-- bereits existieren — auf einer FRISCHEN DB zuerst die Tabellen anlegen, DANN
-- diese Baseline. Die Tabellen-DDL ließe sich später per vollem `pg_dump
-- --schema-only` (braucht Docker/pg_dump) nachziehen, um 100 % Self-Containment
-- zu erreichen — nicht launch-kritisch (die Live-DB ist vollständig eingerichtet).
--
-- IDEMPOTENZ: Funktionen sind CREATE OR REPLACE (re-run-fest). Policies/Trigger
-- sind als reiner Fresh-DB-Snapshot OHNE `drop … if exists` formuliert — auf
-- einer bestehenden DB würden sie „already exists" werfen; zum Neu-Aufsetzen also
-- nur gegen eine leere DB fahren.
--
-- Quelle: SQL-Editor-Introspektion (kein Docker), siehe handshake §Offene Punkte.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────
-- 1 · Funktionen (Helfer + RPCs)
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_list_invitation(_invitation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv public.list_invitations;
begin
  select * into inv from public.list_invitations where id = _invitation_id;
  if inv.id is null then
    raise exception 'invitation not found';
  end if;
  if inv.invitee_user_id <> auth.uid() then
    raise exception 'not your invitation';
  end if;
  if inv.status <> 'pending' then
    raise exception 'invitation is not pending';
  end if;

  update public.list_invitations
    set status = 'accepted', updated_at = now()
    where id = _invitation_id;

  insert into public.list_members (list_id, user_id, role)
    values (inv.list_id, inv.invitee_user_id, 'member')
    on conflict (list_id, user_id) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_sync_for_list_item(_list_item_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _list_id uuid;
  _item_id uuid;
  _sync boolean;
  _inserted int := 0;
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  select li.list_id, li.item_id, li.sync_enabled
    into _list_id, _item_id, _sync
  from public.list_items li
  where li.id = _list_item_id;
  if _list_id is null then
    raise exception 'list_item % not found', _list_item_id;
  end if;

  if not public.is_list_member(_list_id, _uid) then
    raise exception 'not a member of list %', _list_id;
  end if;

  -- only meaningful when sync is currently on
  if not coalesce(_sync, false) then
    return 0;
  end if;

  -- Union of all watched episodes (by any member, for this item) → replicated
  -- to every member. Air-dated-future episodes are filtered out so the guard
  -- trigger can never reject a row.
  with watched as (
    select distinct ew.episode_id
    from public.episode_watches ew
    join public.episodes e on e.id = ew.episode_id
    join public.list_members lm on lm.user_id = ew.user_id and lm.list_id = _list_id
    where e.item_id = _item_id
      and (e.air_date is null or e.air_date <= now())
  ),
  ins as (
    insert into public.episode_watches (user_id, episode_id)
    select lm.user_id, w.episode_id
    from watched w
    cross join public.list_members lm
    where lm.list_id = _list_id
    on conflict (user_id, episode_id) do nothing
    returning 1
  )
  select count(*) into _inserted from ins;

  return _inserted;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_write_catalog_item(_item_id uuid, _uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select exists (
      select 1
      from public.list_items li
      join public.lists l on l.id = li.list_id
      where li.item_id = _item_id
        and (l.owner_id = _uid or public.is_list_member(li.list_id, _uid))
    );
  $function$
;

CREATE OR REPLACE FUNCTION public.continue_watching(_limit integer DEFAULT 50)
 RETURNS TABLE(item_id uuid, title text, type text, cover_url text, total_episodes integer, watched_episodes integer, next_episode integer, last_watched_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with my_watches as (
    select ew.watched_at, e.item_id
    from public.episode_watches ew
    join public.episodes e on e.id = ew.episode_id
    where ew.user_id = auth.uid()
  ),
  per_item as (
    select item_id,
           count(*)::int as watched_episodes,
           max(watched_at) as last_watched_at
    from my_watches
    group by item_id
  ),
  totals as (
    select item_id, count(*)::int as total_episodes
    from public.episodes
    where item_id in (select item_id from per_item)
    group by item_id
  ),
  next_ep as (
    select e.item_id, min(e.episode_number)::int as next_episode
    from public.episodes e
    where e.item_id in (select item_id from per_item)
      and (e.air_date is null or e.air_date <= now())
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid() and ew.episode_id = e.id
      )
    group by e.item_id
  )
  select
    pi.item_id,
    it.title,
    it.type,
    it.cover_url,
    t.total_episodes,
    pi.watched_episodes,
    ne.next_episode,
    pi.last_watched_at
  from per_item pi
  join public.items it on it.id = pi.item_id
  join totals t on t.item_id = pi.item_id
  join next_ep ne on ne.item_id = pi.item_id
  where it.type in ('anime', 'series', 'manga')
    and exists (
      select 1
      from public.list_items li
      join public.list_members lm on lm.list_id = li.list_id and lm.user_id = auth.uid()
      where li.item_id = pi.item_id
        and lm.tracks_home = true
    )
  order by pi.last_watched_at desc
  limit _limit;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _me uuid := auth.uid();
  _blocking int;
begin
  if _me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Lists the caller owns that still have at least one OTHER member.
  select count(*) into _blocking
  from public.lists l
  where l.owner_id = _me
    and exists (
      select 1
      from public.list_members m
      where m.list_id = l.id
        and m.user_id <> _me
    );

  if _blocking > 0 then
    raise exception 'owns_shared_lists'
      using errcode = 'P0001',
            hint = 'Transfer ownership of or delete your shared lists first.';
  end if;

  delete from auth.users where id = _me;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.derive_username(_candidate text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(
    regexp_replace(
      lower(regexp_replace(coalesce(_candidate, ''), '#\d+$', '')),
      '[^a-z0-9._-]+', '', 'g'
    ),
    ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.generate_list_short_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
    adjectives text[] := ARRAY[
      'blue','red','green','gold','silver','bronze','crimson','amber',
      'jade','azure','coral','ivory','mint','rose','sage','teal',
      'swift','calm','wild','brave','kind','bold','gentle','fierce',
      'quiet','merry','sleepy','curious','happy','lucky','eager','keen',
      'cosmic','mystic','lunar','solar','silent','humble','witty','noble',
      'tiny','mighty','soft','sharp','warm','cool','bright','dim',
      'fresh','vintage','ancient','modern','royal','rustic','velvet','crystal',
      'dusty','glossy','misty','sunny'
    ];
    nouns text[] := ARRAY[
      'ostrich','sparrow','falcon','raven','panda','otter','badger','lemur',
      'walrus','gecko','penguin','orca','narwhal','puffin','lynx','koala',
      'river','mountain','forest','meadow','canyon','glacier','lagoon','oasis',
      'comet','planet','galaxy','nebula','eclipse','aurora','horizon','monsoon',
      'maple','cedar','willow','juniper','fern','tulip','lotus','iris',
      'compass','lantern','anchor','beacon','satchel','parchment','feather','kettle',
      'voyager','wanderer','dreamer','pioneer','sailor','gardener','archer','baker',
      'piano','cello','banjo','harp'
    ];
    candidate text; tries int := 0;
  BEGIN
    LOOP
      candidate :=
        adjectives[1 + (random() * (array_length(adjectives,1) - 1))::int] || '-' ||
        adjectives[1 + (random() * (array_length(adjectives,1) - 1))::int] || '-' ||
        nouns[1 + (random() * (array_length(nouns,1) - 1))::int];
      EXIT WHEN NOT EXISTS (SELECT 1 FROM lists WHERE short_code = candidate);
      tries := tries + 1;
      IF tries > 50 THEN
        candidate := candidate || '-' || (1000 + floor(random() * 9000))::int;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM lists WHERE short_code = candidate);
      END IF;
    END LOOP;
    RETURN candidate;
  END $function$
;

CREATE OR REPLACE FUNCTION public.get_list_invitations(_list_id uuid)
 RETURNS TABLE(invitation_id uuid, invitee_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    inv.id,
    coalesce(p.display_name, '@' || p.username, 'Unbekannt'),
    inv.created_at
  from public.list_invitations inv
  left join public.profiles p on p.user_id = inv.invitee_user_id
  where inv.list_id = _list_id
    and inv.status = 'pending'
    and public.is_list_member(_list_id, auth.uid())
  order by inv.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_invitations()
 RETURNS TABLE(invitation_id uuid, list_id uuid, list_name text, inviter_name text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    inv.id,
    inv.list_id,
    l.name,
    coalesce(p.display_name, '@' || p.username, 'Jemand'),
    inv.created_at
  from public.list_invitations inv
  join public.lists l on l.id = inv.list_id
  left join public.profiles p on p.user_id = inv.inviter_user_id
  where inv.invitee_user_id = auth.uid()
    and inv.status = 'pending'
  order by inv.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_list()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.list_members (list_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (list_id, user_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (user_id, display_name, avatar_url, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'preferred_username',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    public.unique_username(
      coalesce(
        public.derive_username(coalesce(
          new.raw_user_meta_data->>'user_name',
          new.raw_user_meta_data->>'preferred_username',
          new.raw_user_meta_data->>'name',
          split_part(new.email, '@', 1)
        )),
        'user'
      )
    )
  );

  -- (no default list — new users start with an empty canvas)

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.home_continue_watching(_limit integer DEFAULT 50)
 RETURNS TABLE(item_id uuid, slug text, title text, type text, cover_url text, total_episodes integer, watched_episodes integer, next_season integer, next_episode integer, last_watched_at timestamp with time zone, new_episode_count integer, list_item_id uuid, list_short_code text, list_name text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with home_items as (
    select distinct li.item_id
    from public.list_items li
    join public.list_members lm
      on lm.list_id = li.list_id and lm.user_id = auth.uid()
    where lm.tracks_home = true
  ),
  -- ── GLOBAL lane (list_item_id IS NULL) ───────────────────────────────
  g_per_item as (
    select e.item_id,
           count(*)::int as watched_episodes,
           max(ew.watched_at) as last_watched_at
    from public.episode_watches ew
    join public.episodes e on e.id = ew.episode_id
    where ew.user_id = auth.uid()
      and ew.list_item_id is null
      and e.item_id in (select item_id from home_items)
    group by e.item_id
  ),
  g_total as (
    select item_id, count(*)::int as total_episodes
    from public.episodes
    where item_id in (select item_id from g_per_item)
    group by item_id
  ),
  -- Lowest unwatched-released (season, episode) — DISTINCT ON keeps the first
  -- row per item under the (item, season, episode) ordering.
  g_next as (
    select distinct on (e.item_id)
           e.item_id,
           e.season_number::int as next_season,
           e.episode_number::int as next_episode
    from public.episodes e
    where e.item_id in (select item_id from g_per_item)
      and (e.air_date is null or e.air_date <= now())
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id is null
      )
    order by e.item_id, e.season_number, e.episode_number
  ),
  -- Released-but-unwatched episodes in the last 14 days — same window + lane as
  -- the /lists badge engine, counted per item.
  g_new as (
    select e.item_id, count(*)::int as new_episode_count
    from public.episodes e
    where e.item_id in (select item_id from g_per_item)
      and e.air_date >= now() - interval '14 days'
      and e.air_date <= now()
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id is null
      )
    group by e.item_id
  ),
  global_rows as (
    select
      pi.item_id,
      it.slug,
      it.title,
      it.type,
      it.cover_url,
      t.total_episodes,
      pi.watched_episodes,
      ne.next_season,
      ne.next_episode,
      pi.last_watched_at,
      coalesce(gn.new_episode_count, 0) as new_episode_count,
      null::uuid as list_item_id,
      null::text as list_short_code,
      null::text as list_name
    from g_per_item pi
    join public.items it on it.id = pi.item_id
    join g_total t on t.item_id = pi.item_id
    join g_next ne on ne.item_id = pi.item_id
    left join g_new gn on gn.item_id = pi.item_id
    where it.type in ('anime', 'series', 'manga')
  ),
  -- ── INSTANCE lane (one per active sync_enabled list_item) ────────────
  inst as (
    select li.id as list_item_id, li.item_id, li.added_at,
           l.short_code as list_short_code, l.name as list_name
    from public.list_items li
    join public.list_members lm
      on lm.list_id = li.list_id and lm.user_id = auth.uid()
    join public.lists l on l.id = li.list_id
    where li.sync_enabled = true
      and lm.tracks_home = true
  ),
  i_per as (
    select i.list_item_id,
           count(ew.episode_id)::int as watched_episodes,
           max(ew.watched_at) as last_watched_at
    from inst i
    left join public.episode_watches ew
      on ew.list_item_id = i.list_item_id and ew.user_id = auth.uid()
    group by i.list_item_id
  ),
  i_total as (
    select i.list_item_id, count(e.id)::int as total_episodes
    from inst i
    join public.episodes e on e.item_id = i.item_id
    group by i.list_item_id
  ),
  i_next as (
    select distinct on (i.list_item_id)
           i.list_item_id,
           e.season_number::int as next_season,
           e.episode_number::int as next_episode
    from inst i
    join public.episodes e on e.item_id = i.item_id
    where (e.air_date is null or e.air_date <= now())
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id = i.list_item_id
      )
    order by i.list_item_id, e.season_number, e.episode_number
  ),
  i_new as (
    select i.list_item_id, count(*)::int as new_episode_count
    from inst i
    join public.episodes e on e.item_id = i.item_id
    where e.air_date >= now() - interval '14 days'
      and e.air_date <= now()
      and not exists (
        select 1 from public.episode_watches ew
        where ew.user_id = auth.uid()
          and ew.episode_id = e.id
          and ew.list_item_id = i.list_item_id
      )
    group by i.list_item_id
  ),
  instance_rows as (
    select
      i.item_id,
      it.slug,
      it.title,
      it.type,
      it.cover_url,
      t.total_episodes,
      p.watched_episodes,
      ne.next_season,
      ne.next_episode,
      coalesce(p.last_watched_at, i.added_at) as last_watched_at,
      coalesce(n.new_episode_count, 0) as new_episode_count,
      i.list_item_id,
      i.list_short_code,
      i.list_name
    from inst i
    join public.items it on it.id = i.item_id
    join i_total t on t.list_item_id = i.list_item_id
    join i_per p on p.list_item_id = i.list_item_id
    join i_next ne on ne.list_item_id = i.list_item_id
    left join i_new n on n.list_item_id = i.list_item_id
    where it.type in ('anime', 'series', 'manga')
  )
  select
    item_id, slug, title, type, cover_url,
    total_episodes, watched_episodes, next_season, next_episode, last_watched_at,
    new_episode_count, list_item_id, list_short_code, list_name
  from (
    select * from global_rows
    union all
    select * from instance_rows
  ) combined
  order by last_watched_at desc nulls last
  limit _limit;
$function$
;

CREATE OR REPLACE FUNCTION public.home_new_releases(_item_ids uuid[])
 RETURNS TABLE(item_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with last_watch as (
    select e.item_id, max(ew.watched_at) as watched_at
    from public.episode_watches ew
    join public.episodes e on e.id = ew.episode_id
    where e.item_id = any(_item_ids)
      and ew.user_id = auth.uid()
      and ew.list_item_id is null
    group by e.item_id
  ),
  last_release as (
    select e.item_id, max(e.air_date) as air_date
    from public.episodes e
    where e.item_id = any(_item_ids)
      and e.air_date <= now()
    group by e.item_id
  )
  select lr.item_id
  from last_release lr
  join last_watch lw on lw.item_id = lr.item_id
  where lr.air_date > lw.watched_at;
$function$
;

CREATE OR REPLACE FUNCTION public.home_watch_bundles(_since timestamp with time zone, _gap_seconds integer, _limit integer)
 RETURNS TABLE(actor_user_id uuid, item_id uuid, season integer, min_episode integer, max_episode integer, episode_count integer, last_watched_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    with resolved as (
      select
        ew.user_id as actor_user_id,
        e.item_id,
        e.season_number,
        e.episode_number,
        ew.watched_at
      from public.episode_watches ew
      join public.episodes e on e.id = ew.episode_id
      where ew.watched_at >= _since
        and ew.list_item_id is null
    ),
    marked as (
      select
        resolved.*,
        case
          when watched_at - lag(watched_at) over (
                 partition by actor_user_id, item_id
                 order by watched_at
               ) > make_interval(secs => _gap_seconds)
          then 1 else 0
        end as new_session
      from resolved
    ),
    bucketed as (
      select
        marked.*,
        sum(new_session) over (
          partition by actor_user_id, item_id
          order by watched_at
          rows between unbounded preceding and current row
        ) as session_id
      from marked
    )
    select
      actor_user_id,
      item_id,
      season_number::int as season,
      min(episode_number)::int as min_episode,
      max(episode_number)::int as max_episode,
      count(*)::int as episode_count,
      max(watched_at) as last_watched_at
    from bucketed
    group by actor_user_id, item_id, session_id, season_number
    order by last_watched_at desc
    limit _limit;
  $function$
;

CREATE OR REPLACE FUNCTION public.invite_to_list(_list_id uuid, _username text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _invitee uuid;
  _norm text := lower(btrim(coalesce(_username, '')));
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  if left(_norm, 1) = '@' then
    _norm := substr(_norm, 2);
  end if;
  if _norm = '' then
    return json_build_object('ok', false, 'error', 'empty');
  end if;

  -- any member can invite (no longer owner-only)
  if not public.is_list_member(_list_id, _uid) then
    raise exception 'not a member of this list';
  end if;

  select user_id into _invitee
  from public.profiles
  where lower(username) = _norm;

  if _invitee is null then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if _invitee = _uid then
    return json_build_object('ok', false, 'error', 'self');
  end if;
  if public.is_list_member(_list_id, _invitee) then
    return json_build_object('ok', false, 'error', 'already_member');
  end if;

  -- the list becomes shared the moment an invite is sent
  update public.lists set is_shared = true where id = _list_id;

  insert into public.list_invitations (list_id, invitee_user_id, inviter_user_id, status)
  values (_list_id, _invitee, _uid, 'pending')
  on conflict (list_id, invitee_user_id)
  do update set status = 'pending', inviter_user_id = _uid, updated_at = now();

  return json_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_co_member(_episode_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.episodes e
    join public.list_items li on li.item_id = e.item_id
    join public.list_members lm on lm.list_id = li.list_id and lm.user_id = _user_id
    where e.id = _episode_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_list_item_member(_list_item_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.list_items li
    join public.list_members lm on lm.list_id = li.list_id and lm.user_id = _user_id
    where li.id = _list_item_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_list_member(_list_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.list_members
    where list_id = _list_id and user_id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_list_owner(_list_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.lists
    where id = _list_id and owner_id = _user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.item_progress(_item_ids uuid[])
 RETURNS TABLE(item_id uuid, total integer, watched integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.items_set_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE base text; candidate text;
  BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
      base := COALESCE(NULLIF(slugify(NEW.title), ''), 'eintrag');
      candidate := base;
      IF EXISTS (
        SELECT 1 FROM items
        WHERE type = NEW.type AND slug = candidate
          AND (source, source_id) IS DISTINCT FROM (NEW.source, NEW.source_id)
      ) THEN
        candidate := base || '-' || NEW.source_id;
      END IF;
      NEW.slug := candidate;
    END IF;
    RETURN NEW;
  END $function$
;

CREATE OR REPLACE FUNCTION public.list_invitations_reconcile_shared()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  begin
    if tg_op = 'DELETE' then
      perform public.reconcile_list_shared(old.list_id);
    elsif tg_op = 'UPDATE'
          and old.status = 'pending'
          and new.status = 'declined' then
      perform public.reconcile_list_shared(new.list_id);
    end if;
    return coalesce(new, old);
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.list_item_progress(_list_item_ids uuid[])
 RETURNS TABLE(list_item_id uuid, item_id uuid, total integer, watched integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_items_set_default_sort_order()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  begin
    if new.sort_order = 0 then
      select coalesce(min(sort_order), 1) - 1
        into new.sort_order
        from public.list_items
        where list_id = new.list_id;
    end if;
    return new;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.list_members_reconcile_shared()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  begin
    perform public.reconcile_list_shared(old.list_id);
    return old;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.list_members_set_default_sort_order()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  begin
    if new.sort_order = 0 then
      select coalesce(min(sort_order), 1) - 1
        into new.sort_order
        from public.list_members
        where user_id = new.user_id;
    end if;
    return new;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.lists_set_short_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    IF NEW.short_code IS NULL OR NEW.short_code = '' THEN
      NEW.short_code := generate_list_short_code();
    END IF;
    RETURN NEW;
  END $function$
;

CREATE OR REPLACE FUNCTION public.mark_episodes_watched(_item_id uuid, _up_to_episode_id uuid, _list_item_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    _uid uuid := auth.uid();
    _target_season int;
    _target_episode int;
    _sync boolean;
    _list_id uuid;
  begin
    if _uid is null then
      raise exception 'not authenticated';
    end if;

    select season_number, episode_number
      into _target_season, _target_episode
    from public.episodes
    where id = _up_to_episode_id and item_id = _item_id;
    if not found then
      raise exception 'episode % not found for item %', _up_to_episode_id, _item_id;
    end if;

    if _list_item_id is not null then
      select li.sync_enabled, li.list_id
        into _sync, _list_id
      from public.list_items li
      where li.id = _list_item_id and li.item_id = _item_id;

      if _sync and _list_id is not null and public.is_list_member(_list_id, _uid) then
        insert into public.episode_watches (user_id, episode_id)
        select lm.user_id, e.id
        from public.episodes e
        cross join public.list_members lm
        where e.item_id = _item_id
          and (e.season_number, e.episode_number) <= (_target_season, _target_episode)
          and (e.air_date is null or e.air_date <= now())
          and lm.list_id = _list_id
        on conflict (user_id, episode_id) do nothing;
        return;
      end if;
    end if;

    insert into public.episode_watches (user_id, episode_id)
    select _uid, e.id
    from public.episodes e
    where e.item_id = _item_id
      and (e.season_number, e.episode_number) <= (_target_season, _target_episode)
      and (e.air_date is null or e.air_date <= now())
    on conflict (user_id, episode_id) do nothing;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.mark_episodes_watched_synced(_item_id uuid, _up_to_episode_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    _uid uuid := auth.uid();
    _target_season int;
    _target_episode int;
  begin
    if _uid is null then
      raise exception 'not authenticated';
    end if;

    select season_number, episode_number
      into _target_season, _target_episode
    from public.episodes
    where id = _up_to_episode_id and item_id = _item_id;
    if not found then
      raise exception 'episode % not found for item %', _up_to_episode_id, _item_id;
    end if;

    -- Caller's own rows first (covers the no-sync-list case unconditionally).
    insert into public.episode_watches (user_id, episode_id)
    select _uid, e.id
    from public.episodes e
    where e.item_id = _item_id
      and (e.season_number, e.episode_number) <= (_target_season, _target_episode)
      and (e.air_date is null or e.air_date <= now())
    on conflict (user_id, episode_id) do nothing;

    -- Fan out across every sync-ON list the caller is in that holds this item.
    insert into public.episode_watches (user_id, episode_id)
    select distinct lm.user_id, e.id
    from public.episodes e
    join public.list_items li
      on li.item_id = _item_id and li.sync_enabled = true
    join public.list_members lm
      on lm.list_id = li.list_id
    where e.item_id = _item_id
      and (e.season_number, e.episode_number) <= (_target_season, _target_episode)
      and (e.air_date is null or e.air_date <= now())
      and exists (
        select 1 from public.list_members me
        where me.list_id = li.list_id and me.user_id = _uid
      )
    on conflict (user_id, episode_id) do nothing;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.mark_episodes_watched_upto(_item_id uuid, _up_to_episode_id uuid, _list_item_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_list_shared(_list_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  begin
    update public.lists l
    set is_shared = false
    where l.id = _list_id
      and l.is_shared
      and (
        select count(*) from public.list_members m where m.list_id = _list_id
      ) <= 1
      and not exists (
        select 1 from public.list_invitations inv
        where inv.list_id = _list_id and inv.status = 'pending'
      );
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.reject_unaired_watch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    _air timestamptz;
  begin
    select air_date into _air from public.episodes where id = new.episode_id;
    if _air is not null and _air > now() then
      raise exception 'cannot mark unaired episode % as watched (airs %)',
        new.episode_id, _air;
    end if;
    return new;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.reorder_list_items(_list_id uuid, _ordered_list_item_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  begin
    -- Authorization: caller must be a member of the list.
    if not exists (
      select 1 from public.list_members
       where list_id = _list_id and user_id = auth.uid()
    ) then
      raise exception 'access denied';
    end if;

    update public.list_items
       set sort_order = ord.position::int
      from unnest(_ordered_list_item_ids) with ordinality as ord(id, position)
     where list_items.id = ord.id
       and list_items.list_id = _list_id;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.reorder_list_members(_user_id uuid, _ordered_list_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  begin
    -- Caller may only reorder their own membership rows.
    if _user_id is distinct from auth.uid() then
      raise exception 'access denied';
    end if;

    update public.list_members
       set sort_order = ord.position::int
      from unnest(_ordered_list_ids) with ordinality as ord(id, position)
     where list_members.list_id = ord.id
       and list_members.user_id = _user_id;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.reset_item_progress(_item_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  delete from public.episode_watches ew
  using public.episodes e
  where ew.episode_id = e.id
    and e.item_id = _item_id
    and ew.user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.reset_progress(_item_id uuid, _list_item_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    _uid uuid := auth.uid();
    _sync boolean := false;
    _list_id uuid;
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

    if _sync then
      delete from public.episode_watches
      where list_item_id = _list_item_id;
    else
      delete from public.episode_watches ew
      using public.episodes e
      where ew.episode_id = e.id
        and e.item_id = _item_id
        and ew.user_id = _uid
        and ew.list_item_id is null;
    end if;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.set_episode_watch(_item_id uuid, _episode_id uuid, _watched boolean, _list_item_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_item_metadata(_item_id uuid, _metadata jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  begin
    update public.items
       set metadata = coalesce(_metadata, '{}'::jsonb)
     where id = _item_id
       and public.can_write_catalog_item(_item_id, auth.uid());
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.set_list_item_pin(_list_item_id uuid, _pinned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    declare
      _list_id uuid;
    begin
      select list_id into _list_id
        from public.list_items
       where id = _list_item_id;
      if _list_id is null then
        raise exception 'list item not found';
      end if;

      -- Authorization: caller must be a member of the list (same check as
      -- reorder_list_items).
      if not exists (
        select 1 from public.list_members
         where list_id = _list_id and user_id = auth.uid()
      ) then
        raise exception 'access denied';
      end if;

      update public.list_items li
         set pinned_at = case when _pinned then now() else null end,
             sort_order = coalesce(
               (select min(s.sort_order) - 1
                  from public.list_items s
                 where s.list_id = _list_id
                   and s.id <> _list_item_id
                   and (s.pinned_at is not null) = _pinned),
               0)
       where li.id = _list_item_id;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.set_list_pin(_user_id uuid, _list_id uuid, _pinned boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    begin
      -- Caller may only pin their own membership rows.
      if _user_id is distinct from auth.uid() then
        raise exception 'access denied';
      end if;

      update public.list_members lm
         set pinned_at = case when _pinned then now() else null end,
             sort_order = coalesce(
               (select min(s.sort_order) - 1
                  from public.list_members s
                 where s.user_id = _user_id
                   and s.list_id <> _list_id
                   and (s.pinned_at is not null) = _pinned),
               0)
       where lm.list_id = _list_id
         and lm.user_id = _user_id;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.set_list_tracking(_user_id uuid, _list_id uuid, _enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    declare
      _result boolean;
    begin
      if _user_id is distinct from auth.uid() then
        raise exception 'access denied';
      end if;

      update public.list_members lm
         set tracks_home = _enabled
       where lm.list_id = _list_id
         and lm.user_id = _user_id
      returning lm.tracks_home into _result;

      return _result;
    end;
    $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.shares_item_in_list_with(_item_id uuid, _other uuid, _me uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.list_items li
    join public.list_members me on me.list_id = li.list_id and me.user_id = _me
    join public.list_members ot on ot.list_id = li.list_id and ot.user_id = _other
    where li.item_id = _item_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.shares_list_with(_other_user uuid, _me uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.list_members a
    join public.list_members b on b.list_id = a.list_id
    where a.user_id = _me
      and b.user_id = _other_user
  );
$function$
;

CREATE OR REPLACE FUNCTION public.slugify(input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
  DECLARE s text;
  BEGIN
    s := replace(input, 'ß', 'ss');
    s := lower(translate(s,
      'äöüÄÖÜàáâãèéêëìíîïòóôõùúûýÿñçÀÁÂÃÈÉÊËÌÍÎÏÒÓÔÕÙÚÛÝÑÇ',
      'aouAOUaaaaeeeeiiiioooouuuyyncAAAAEEEEIIIIOOOOOUUUYNC'));
    s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
    s := regexp_replace(s, '^-+|-+$', '', 'g');
    RETURN s;
  END $function$
;

CREATE OR REPLACE FUNCTION public.toggle_episode_synced(_item_id uuid, _episode_id uuid, _watched boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    _uid uuid := auth.uid();
  begin
    if _uid is null then
      raise exception 'not authenticated';
    end if;

    if not exists (
      select 1 from public.episodes
      where id = _episode_id and item_id = _item_id
    ) then
      raise exception 'episode % does not belong to item %', _episode_id, _item_id;
    end if;

    if _watched then
      insert into public.episode_watches (user_id, episode_id)
      values (_uid, _episode_id)
      on conflict (user_id, episode_id) do nothing;

      insert into public.episode_watches (user_id, episode_id)
      select distinct lm.user_id, _episode_id
      from public.list_items li
      join public.list_members lm on lm.list_id = li.list_id
      where li.item_id = _item_id
        and li.sync_enabled = true
        and exists (
          select 1 from public.list_members me
          where me.list_id = li.list_id and me.user_id = _uid
        )
      on conflict (user_id, episode_id) do nothing;
    else
      delete from public.episode_watches
      where user_id = _uid and episode_id = _episode_id;

      delete from public.episode_watches ew
      using (
        select distinct lm.user_id
        from public.list_items li
        join public.list_members lm on lm.list_id = li.list_id
        where li.item_id = _item_id
          and li.sync_enabled = true
          and exists (
            select 1 from public.list_members me
            where me.list_id = li.list_id and me.user_id = _uid
          )
      ) members
      where ew.episode_id = _episode_id
        and ew.user_id = members.user_id;
    end if;
  end;
  $function$
;

CREATE OR REPLACE FUNCTION public.transfer_list_ownership(_list_id uuid, _new_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _current_owner uuid;
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  select owner_id into _current_owner from public.lists where id = _list_id;
  if _current_owner is null then
    raise exception 'list % not found', _list_id;
  end if;
  if _current_owner <> _uid then
    raise exception 'not the list owner';
  end if;
  if _new_owner_id = _uid then
    raise exception 'already owner';
  end if;
  if not public.is_list_member(_list_id, _new_owner_id) then
    raise exception 'target is not a member of this list';
  end if;

  update public.lists set owner_id = _new_owner_id where id = _list_id;

  update public.list_members
    set role = case
      when user_id = _new_owner_id then 'owner'
      when user_id = _current_owner then 'member'
      else role
    end
    where list_id = _list_id
      and user_id in (_current_owner, _new_owner_id);

  -- Log it. One row per transfer; the Logbuch reads recent rows within its
  -- activity window. Members of the list see the entry (RLS).
  insert into public.list_ownership_transfers (list_id, from_user_id, to_user_id)
    values (_list_id, _current_owner, _new_owner_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unique_username(_base text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  base text := coalesce(_base, 'user');
  candidate text := coalesce(_base, 'user');
  n int := 1;
begin
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unsync_item(_list_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_episodes(_item_id uuid, _rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  $function$
;

CREATE OR REPLACE FUNCTION public.upsert_item(_source text, _source_id text, _type text, _title text, _cover_url text, _metadata jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _id uuid;
begin
  insert into public.items (source, source_id, type, title, cover_url, metadata)
  values (_source, _source_id, _type, _title, _cover_url, coalesce(_metadata, '{}'::jsonb))
  on conflict (source, source_id) do update set source_id = excluded.source_id
  returning id into _id;
  return _id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.username_available(_username text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    _uid uuid := auth.uid();
    _norm text := lower(btrim(coalesce(_username, '')));
  begin
    if _uid is null then
      raise exception 'not authenticated';
    end if;
    if left(_norm, 1) = '@' then
      _norm := substr(_norm, 2);
    end if;
    if _norm !~ '^[a-z0-9._-]{3,30}$' then
      return json_build_object('available', false, 'error', 'invalid');
    end if;
    if exists (
      select 1 from public.profiles
      where lower(username) = _norm and user_id <> _uid
    ) then
      return json_build_object('available', false, 'error', 'taken');
    end if;
    return json_build_object('available', true, 'normalized', _norm);
  end;
  $function$
;


-- ────────────────────────────────────────────────────────────────────────
-- 2 · RLS-Enablement
-- ────────────────────────────────────────────────────────────────────────

alter table public.episode_watches enable row level security;
alter table public.episodes enable row level security;
alter table public.item_history enable row level security;
alter table public.item_notes enable row level security;
alter table public.items enable row level security;
alter table public.list_invitations enable row level security;
alter table public.list_items enable row level security;
alter table public.list_members enable row level security;
alter table public.list_ownership_transfers enable row level security;
alter table public.lists enable row level security;
alter table public.profiles enable row level security;


-- ────────────────────────────────────────────────────────────────────────
-- 3 · Policies
-- ────────────────────────────────────────────────────────────────────────

create policy episode_watches_delete_own on public.episode_watches as permissive for delete to authenticated using ((user_id = auth.uid()));
create policy episode_watches_insert_own on public.episode_watches as permissive for insert to authenticated with check (((user_id = auth.uid()) AND ((list_item_id IS NULL) OR is_list_item_member(list_item_id, auth.uid()))));
create policy episode_watches_select_co on public.episode_watches as permissive for select to authenticated using (((user_id = auth.uid()) OR ((list_item_id IS NULL) AND shares_list_with(user_id, auth.uid())) OR ((list_item_id IS NOT NULL) AND is_list_item_member(list_item_id, auth.uid()))));
create policy episode_watches_update_own on public.episode_watches as permissive for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));

create policy episodes_select_all on public.episodes as permissive for select to authenticated using (true);

create policy item_history_delete_own on public.item_history as permissive for delete to authenticated using ((user_id = auth.uid()));
create policy item_history_insert_own on public.item_history as permissive for insert to authenticated with check ((user_id = auth.uid()));
create policy item_history_select_co on public.item_history as permissive for select to authenticated using (((user_id = auth.uid()) OR shares_item_in_list_with(item_id, user_id, auth.uid())));
create policy item_history_update_own on public.item_history as permissive for update to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));

create policy item_notes_delete_own on public.item_notes as permissive for delete to authenticated using (((author_user_id = auth.uid()) AND is_list_member(list_id, auth.uid())));
create policy item_notes_insert_member on public.item_notes as permissive for insert to authenticated with check (((author_user_id = auth.uid()) AND is_list_member(list_id, auth.uid())));
create policy item_notes_select_member on public.item_notes as permissive for select to authenticated using (is_list_member(list_id, auth.uid()));
create policy item_notes_update_own on public.item_notes as permissive for update to authenticated using (((author_user_id = auth.uid()) AND is_list_member(list_id, auth.uid()))) with check ((author_user_id = auth.uid()));

create policy items_select_all on public.items as permissive for select to authenticated using (true);

create policy list_invitations_delete_member on public.list_invitations as permissive for delete to authenticated using (is_list_member(list_id, auth.uid()));
create policy list_invitations_insert_member on public.list_invitations as permissive for insert to authenticated with check (((inviter_user_id = auth.uid()) AND is_list_member(list_id, auth.uid())));
create policy list_invitations_select_party on public.list_invitations as permissive for select to authenticated using (((invitee_user_id = auth.uid()) OR (inviter_user_id = auth.uid()) OR is_list_member(list_id, auth.uid())));
create policy list_invitations_update_invitee on public.list_invitations as permissive for update to authenticated using ((invitee_user_id = auth.uid())) with check ((invitee_user_id = auth.uid()));

create policy list_items_delete_member on public.list_items as permissive for delete to authenticated using (is_list_member(list_id, auth.uid()));
create policy list_items_insert_member on public.list_items as permissive for insert to authenticated with check ((is_list_member(list_id, auth.uid()) AND ((added_by_user_id IS NULL) OR (added_by_user_id = auth.uid()))));
create policy list_items_select_member on public.list_items as permissive for select to authenticated using (is_list_member(list_id, auth.uid()));
create policy list_items_update_member on public.list_items as permissive for update to authenticated using (is_list_member(list_id, auth.uid())) with check (is_list_member(list_id, auth.uid()));

create policy list_members_delete_owner_or_self on public.list_members as permissive for delete to authenticated using ((((user_id = auth.uid()) AND (NOT is_list_owner(list_id, auth.uid()))) OR (is_list_owner(list_id, auth.uid()) AND (user_id <> auth.uid()))));
create policy list_members_insert_owner on public.list_members as permissive for insert to authenticated with check (is_list_owner(list_id, auth.uid()));
create policy list_members_select_member on public.list_members as permissive for select to authenticated using (((user_id = auth.uid()) OR is_list_member(list_id, auth.uid())));
create policy list_members_update_owner on public.list_members as permissive for update to authenticated using (is_list_owner(list_id, auth.uid())) with check (is_list_owner(list_id, auth.uid()));

create policy list_ownership_transfers_select_member on public.list_ownership_transfers as permissive for select to authenticated using (is_list_member(list_id, auth.uid()));

create policy lists_delete_owner on public.lists as permissive for delete to authenticated using ((owner_id = auth.uid()));
create policy lists_insert_own on public.lists as permissive for insert to authenticated with check ((owner_id = auth.uid()));
create policy lists_select_member on public.lists as permissive for select to authenticated using (((owner_id = auth.uid()) OR is_list_member(id, auth.uid())));
create policy lists_update_owner on public.lists as permissive for update to authenticated using ((owner_id = auth.uid())) with check ((owner_id = auth.uid()));

create policy profiles_insert_own on public.profiles as permissive for insert to authenticated with check ((auth.uid() = user_id));
create policy profiles_select_co_member on public.profiles as permissive for select to authenticated using (shares_list_with(user_id, auth.uid()));
create policy profiles_select_own on public.profiles as permissive for select to authenticated using ((auth.uid() = user_id));
create policy profiles_update_own on public.profiles as permissive for update to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));


-- ────────────────────────────────────────────────────────────────────────
-- 4 · Trigger
-- ────────────────────────────────────────────────────────────────────────

CREATE TRIGGER episode_watches_no_unaired BEFORE INSERT ON public.episode_watches FOR EACH ROW EXECUTE FUNCTION reject_unaired_watch();
CREATE TRIGGER on_item_history_updated BEFORE UPDATE ON public.item_history FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER on_item_notes_updated BEFORE UPDATE ON public.item_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER items_set_slug_trigger BEFORE INSERT ON public.items FOR EACH ROW EXECUTE FUNCTION items_set_slug();
CREATE TRIGGER list_invitations_reconcile_shared AFTER DELETE OR UPDATE ON public.list_invitations FOR EACH ROW EXECUTE FUNCTION list_invitations_reconcile_shared();
CREATE TRIGGER on_invitation_updated BEFORE UPDATE ON public.list_invitations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER list_items_set_default_sort_order_trigger BEFORE INSERT ON public.list_items FOR EACH ROW EXECUTE FUNCTION list_items_set_default_sort_order();
CREATE TRIGGER list_members_reconcile_shared AFTER DELETE ON public.list_members FOR EACH ROW EXECUTE FUNCTION list_members_reconcile_shared();
CREATE TRIGGER list_members_set_default_sort_order_trigger BEFORE INSERT ON public.list_members FOR EACH ROW EXECUTE FUNCTION list_members_set_default_sort_order();
CREATE TRIGGER lists_set_short_code_trigger BEFORE INSERT ON public.lists FOR EACH ROW EXECUTE FUNCTION lists_set_short_code();
CREATE TRIGGER on_list_created AFTER INSERT ON public.lists FOR EACH ROW EXECUTE FUNCTION handle_new_list();
CREATE TRIGGER on_list_updated BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER on_profile_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
