-- Nakama · catch-up snapshot of Phase 3-5 schema (slug · short-code · pin/reorder)
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.
--
-- These objects were created directly in the SQL editor during Phases 3-5 and
-- never captured in a migration file (Nakama had no migrations folder until
-- 2026-05-29). On the live DB this file is a no-op — every statement is
-- guarded (IF NOT EXISTS / OR REPLACE / DROP-then-CREATE). Its job is fresh-
-- environment reproducibility: applied after the Logbook core migrations and
-- before the 2026-05-29 home/pin RPC migrations, it rebuilds exactly this slice.
--
-- The function bodies are reproduced verbatim from pg_get_functiondef on the
-- live DB. NOTE: items_set_slug / generate_list_short_code / lists_set_short_code
-- are SECURITY DEFINER without an explicit `set search_path` — preserved as-is
-- here to stay a faithful snapshot; tightening that is a separate change.

-- ── Functions ───────────────────────────────────────────────────────────────

-- slug helpers
create or replace function public.slugify(input text)
returns text language plpgsql immutable
as $$
  declare s text;
  begin
    s := replace(input, 'ß', 'ss');
    s := lower(translate(s,
      'äöüÄÖÜàáâãèéêëìíîïòóôõùúûýÿñçÀÁÂÃÈÉÊËÌÍÎÏÒÓÔÕÙÚÛÝÑÇ',
      'aouAOUaaaaeeeeiiiioooouuuyyncAAAAEEEEIIIIOOOOOUUUYNC'));
    s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
    s := regexp_replace(s, '^-+|-+$', '', 'g');
    return s;
  end $$;

create or replace function public.items_set_slug()
returns trigger language plpgsql security definer
as $$
  declare base text; candidate text;
  begin
    if new.slug is null or new.slug = '' then
      base := coalesce(nullif(slugify(new.title), ''), 'eintrag');
      candidate := base;
      if exists (
        select 1 from items
        where type = new.type and slug = candidate
          and (source, source_id) is distinct from (new.source, new.source_id)
      ) then
        candidate := base || '-' || new.source_id;
      end if;
      new.slug := candidate;
    end if;
    return new;
  end $$;

-- short-code helpers
create or replace function public.generate_list_short_code()
returns text language plpgsql security definer
as $$
  declare
    adjectives text[] := array[
      'blue','red','green','gold','silver','bronze','crimson','amber',
      'jade','azure','coral','ivory','mint','rose','sage','teal',
      'swift','calm','wild','brave','kind','bold','gentle','fierce',
      'quiet','merry','sleepy','curious','happy','lucky','eager','keen',
      'cosmic','mystic','lunar','solar','silent','humble','witty','noble',
      'tiny','mighty','soft','sharp','warm','cool','bright','dim',
      'fresh','vintage','ancient','modern','royal','rustic','velvet','crystal',
      'dusty','glossy','misty','sunny'
    ];
    nouns text[] := array[
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
  begin
    loop
      candidate :=
        adjectives[1 + (random() * (array_length(adjectives,1) - 1))::int] || '-' ||
        adjectives[1 + (random() * (array_length(adjectives,1) - 1))::int] || '-' ||
        nouns[1 + (random() * (array_length(nouns,1) - 1))::int];
      exit when not exists (select 1 from lists where short_code = candidate);
      tries := tries + 1;
      if tries > 50 then
        candidate := candidate || '-' || (1000 + floor(random() * 9000))::int;
        exit when not exists (select 1 from lists where short_code = candidate);
      end if;
    end loop;
    return candidate;
  end $$;

create or replace function public.lists_set_short_code()
returns trigger language plpgsql
as $$
  begin
    if new.short_code is null or new.short_code = '' then
      new.short_code := generate_list_short_code();
    end if;
    return new;
  end $$;

-- default sort_order on insert (places a new row at the top of its section)
create or replace function public.list_members_set_default_sort_order()
returns trigger language plpgsql
as $$
  begin
    if new.sort_order = 0 then
      select coalesce(min(sort_order), 1) - 1
        into new.sort_order
        from public.list_members
        where user_id = new.user_id;
    end if;
    return new;
  end $$;

create or replace function public.list_items_set_default_sort_order()
returns trigger language plpgsql
as $$
  begin
    if new.sort_order = 0 then
      select coalesce(min(sort_order), 1) - 1
        into new.sort_order
        from public.list_items
        where list_id = new.list_id;
    end if;
    return new;
  end $$;

-- drag-reorder RPCs (atomic single-statement sort_order reassignment)
create or replace function public.reorder_list_members(_user_id uuid, _ordered_list_ids uuid[])
returns void language plpgsql security definer set search_path to 'public'
as $$
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
  end $$;

create or replace function public.reorder_list_items(_list_id uuid, _ordered_list_item_ids uuid[])
returns void language plpgsql security definer set search_path to 'public'
as $$
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
  end $$;

-- ── Columns ─────────────────────────────────────────────────────────────────
-- Added nullable, then constrained, so a re-run on the live DB (where they
-- already exist NOT NULL) is a clean no-op. short_code / slug are populated by
-- the BEFORE INSERT triggers above; the tables are empty at first apply on a
-- fresh environment, so the SET NOT NULL has no rows to reject.

alter table public.lists       add column if not exists short_code text;
alter table public.items        add column if not exists slug       text;
alter table public.list_members add column if not exists pinned_at  timestamptz;
alter table public.list_members add column if not exists sort_order integer not null default 0;
alter table public.list_items   add column if not exists pinned_at  timestamptz;
alter table public.list_items   add column if not exists sort_order integer not null default 0;

-- Backfill any short_code gaps before constraining (no-op on the live DB).
update public.lists set short_code = public.generate_list_short_code()
 where short_code is null or short_code = '';

alter table public.lists alter column short_code set not null;
alter table public.items alter column slug       set not null;

-- ── Triggers ────────────────────────────────────────────────────────────────
-- DROP-then-CREATE for idempotency (CREATE TRIGGER has no IF NOT EXISTS).

drop trigger if exists items_set_slug_trigger on public.items;
create trigger items_set_slug_trigger
  before insert on public.items
  for each row execute function items_set_slug();

drop trigger if exists lists_set_short_code_trigger on public.lists;
create trigger lists_set_short_code_trigger
  before insert on public.lists
  for each row execute function lists_set_short_code();

drop trigger if exists list_members_set_default_sort_order_trigger on public.list_members;
create trigger list_members_set_default_sort_order_trigger
  before insert on public.list_members
  for each row execute function list_members_set_default_sort_order();

drop trigger if exists list_items_set_default_sort_order_trigger on public.list_items;
create trigger list_items_set_default_sort_order_trigger
  before insert on public.list_items
  for each row execute function list_items_set_default_sort_order();

-- ── Indexes ─────────────────────────────────────────────────────────────────

create unique index if not exists items_type_slug_unique
  on public.items using btree (type, slug);

create unique index if not exists lists_short_code_unique
  on public.lists using btree (short_code);

create index if not exists list_items_list_sort_idx
  on public.list_items using btree (list_id, pinned_at desc nulls last, sort_order);

create index if not exists list_members_user_sort_idx
  on public.list_members using btree (user_id, pinned_at desc nulls last, sort_order);
