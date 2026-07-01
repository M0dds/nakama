-- ============================================================================
-- get_list_invitations: also return the invitee's avatar URL.
-- ============================================================================
-- The owner's "Ausstehend" roster (MembersModule) renders an Avatar for each
-- pending invitee, but only had the name → it always fell back to the initial.
-- A pending invitee is NOT yet a co-member, so the owner can't read their
-- profile via RLS (profiles_select_co_member / _own) — the avatar must come
-- from this SECURITY DEFINER RPC, exactly like the name already does.
--
-- Adding a column to a RETURNS TABLE signature → drop + recreate.
-- (get_my_invitations / the InvitationsInbox stays text-only by design — it
--  shows no avatar, so it needs no change.)
-- ============================================================================

drop function if exists public.get_list_invitations(uuid);

create function public.get_list_invitations(_list_id uuid)
returns table (
  invitation_id uuid,
  invitee_name text,
  invitee_avatar_url text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    inv.id,
    coalesce(p.display_name, '@' || p.username, 'Unbekannt'),
    p.avatar_url,
    inv.created_at
  from public.list_invitations inv
  left join public.profiles p on p.user_id = inv.invitee_user_id
  where inv.list_id = _list_id
    and inv.status = 'pending'
    and public.is_list_member(_list_id, auth.uid())
  order by inv.created_at desc;
$$;

grant execute on function public.get_list_invitations(uuid) to authenticated;
