-- Nakama · atomic pin toggles (Bundle 7 — HEALTH B1)
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.
-- create-or-replace, safe to re-run.
--
-- The pin mutations (setListPin / setListItemPin) used to compute the new
-- sort_order client-side (MIN(target section) - 1, read from the query cache)
-- and send it in the UPDATE. That read-then-write gap raced against the
-- reorder_list_members / reorder_list_items RPCs, which reassign sort_order
-- server-side: a reorder committing between the client's cache read and its
-- write left the pinned row with a stale sort_order, so it didn't land at the
-- top of its section.
--
-- These RPCs close the gap by computing the target sort_order inside the same
-- statement that flips pinned_at — no client value, no stale read. Style +
-- authorization mirror the existing reorder_* RPCs: SECURITY DEFINER,
-- search_path pinned, _user_id checked against auth.uid() for the per-user
-- list pin, and an EXISTS membership check for the shared item pin.
--
-- "Target section" = the rows the pinned row is moving INTO: for _pinned=true
-- the already-pinned peers, for _pinned=false the unpinned peers. The new row
-- floats to the top of that section (MIN - 1), or sort_order 0 when the
-- section is empty — matching the client's topOfSection helper exactly.

-- ── set_list_pin (per-user, on list_members) ────────────────────────────────
create or replace function public.set_list_pin(
  _user_id uuid,
  _list_id uuid,
  _pinned boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  $function$;

-- ── set_list_item_pin (shared, on list_items) ───────────────────────────────
create or replace function public.set_list_item_pin(
  _list_item_id uuid,
  _pinned boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  $function$;
