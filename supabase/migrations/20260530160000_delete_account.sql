-- ============================================================================
-- delete_account — self-service account deletion.
--
-- Product policy: BLOCK deletion while the caller still owns any list that has
-- another member. They must transfer ownership or delete those shared lists
-- first (the UI surfaces them as links + disables the button; this RPC
-- re-checks server-side as defense in depth).
--
-- Once unblocked, deleting the auth.users row is the single source of truth —
-- every user-owned row cascades from there:
--   profiles.user_id            → auth.users ON DELETE CASCADE
--   lists.owner_id              → auth.users ON DELETE CASCADE
--   list_members.user_id        → auth.users ON DELETE CASCADE
--   episode_watches.user_id     → auth.users ON DELETE CASCADE
--   item_history.user_id        → auth.users ON DELETE CASCADE
--   list_items.added_by_user_id → auth.users ON DELETE SET NULL (entries stay)
--
-- SECURITY DEFINER: deleting from auth.users needs elevated rights. Create this
-- in the Supabase SQL editor (owner = postgres, which holds auth-schema rights).
-- ============================================================================

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
