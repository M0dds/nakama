-- ============================================================================
-- Nakama · lists.is_shared reconciliation — flip a list back to PRIVATE once it
-- falls back to "just the owner, no pending invitations".
-- Run in Supabase Dashboard → SQL Editor.
--
-- Today `is_shared` is one-way: invite_to_list sets it true and nothing ever
-- clears it. So a list whose members all leave (or whose only invite is
-- declined/revoked) stays under "Geteilte Listen" forever, even though it's
-- effectively private again. This adds the missing reverse transition.
--
-- Rule (matches the "shared" intent): a list is shared while it has a
-- co-member OR an outstanding (pending) invitation. The moment BOTH are gone —
-- only the owner remains and no invite is pending — it's private again.
--
-- SHARED-DB NOTE: Logbook lives on the same project and uses the same
-- is_shared semantics, so this reverse transition is correct for it too.
-- create-or-replace + drop-if-exists, safe to re-run.
-- ============================================================================

-- Recompute is_shared for one list. Only ever flips true → false (never the
-- other way — that's invite_to_list's job), so it can't accidentally "share" a
-- list. SECURITY DEFINER: triggered by a leaving member / declining invitee who
-- may no longer have rights on the list row itself.
create or replace function public.reconcile_list_shared(_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ── Trigger 1: a member leaves (list_members DELETE) ────────────────────────
create or replace function public.list_members_reconcile_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reconcile_list_shared(old.list_id);
  return old;
end;
$$;

drop trigger if exists list_members_reconcile_shared on public.list_members;
create trigger list_members_reconcile_shared
  after delete on public.list_members
  for each row
  execute function public.list_members_reconcile_shared();

-- ── Trigger 2: a pending invite is revoked (DELETE) or declined (UPDATE) ─────
-- Deliberately NOT on accept (status → 'accepted'): accept also inserts a
-- member, and reconciling here could race that insert and wrongly un-share.
create or replace function public.list_invitations_reconcile_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists list_invitations_reconcile_shared on public.list_invitations;
create trigger list_invitations_reconcile_shared
  after delete or update on public.list_invitations
  for each row
  execute function public.list_invitations_reconcile_shared();
