-- ============================================================================
-- Prefer display_name over @handle in invitation labels.
--
-- App-wide policy (matches the client resolvers actorProfiles + profilesById):
-- a person's friendly label is their display_name first, the @handle only as
-- fallback. These two RPCs build the inbox card ("X hat dich eingeladen") and
-- the owner's pending list, so they flip the same way.
--
-- Faithful re-creation of the live functions — only the coalesce order changes.
-- get_list_invitations keeps the is_list_member guard from 20260528130000
-- (lists_equal_members), NOT the older is_list_owner form.
-- ============================================================================

create or replace function public.get_my_invitations()
returns table (
  invitation_id uuid,
  list_id uuid,
  list_name text,
  inviter_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
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
$$;

create or replace function public.get_list_invitations(_list_id uuid)
returns table (
  invitation_id uuid,
  invitee_name text,
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
    inv.created_at
  from public.list_invitations inv
  left join public.profiles p on p.user_id = inv.invitee_user_id
  where inv.list_id = _list_id
    and inv.status = 'pending'
    and public.is_list_member(_list_id, auth.uid())
  order by inv.created_at desc;
$$;
