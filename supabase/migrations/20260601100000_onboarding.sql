-- First-login onboarding: an "onboarded" flag + a username-availability check.

-- 1) onboarded_at — NULL means the user hasn't completed the /setup flow yet.
--    Existing users are backfilled to now() so they are NEVER sent through
--    setup retroactively (new signups get NULL via the handle_new_user insert,
--    which doesn't set this column).
alter table public.profiles
  add column if not exists onboarded_at timestamptz;

update public.profiles
  set onboarded_at = now()
  where onboarded_at is null;

-- 2) username availability — profiles RLS only exposes co-members, so the
--    client can't check an arbitrary @handle directly. SECURITY DEFINER reads
--    across all profiles to answer "is this handle free for me?". Shape mirrors
--    derive_username: 3–30 chars of [a-z0-9._-], lowercased. The actual write
--    is a normal self-update on profiles (profiles_update_own RLS) that relies
--    on the existing UNIQUE(username) constraint to settle the race.
create or replace function public.username_available(_username text)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
$$;
