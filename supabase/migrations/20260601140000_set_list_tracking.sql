-- Nakama · per-user list tracking toggle via DEFINER RPC
-- Run in Supabase Dashboard → SQL Editor → New Query → Run.
-- create-or-replace, safe to re-run.
--
-- Bug: a member (non-owner) of a shared list set to "track" could not switch
-- it to "archive" — the toggle bounced straight back. Cause: the tracking
-- toggle wrote tracks_home via a direct UPDATE on list_members, but the
-- list_members UPDATE policy (list_members_update_owner) is OWNER-ONLY
-- (using/with check is_list_owner(...)). RLS silently blocked the member's
-- write (0 rows, no error), so setListTracking selected nothing back and the
-- client reverted (the res.tracksHome === null path in ListTrackingToggle).
--
-- tracks_home is a genuinely per-user flag — every member decides for
-- themselves whether a list shows up in THEIR Home/Calendar/Logbook. The pin
-- toggle already routes through a DEFINER RPC (set_list_pin) for the same
-- reason and works for members; this RPC closes the last gap.
--
-- Style + authorization mirror set_list_pin: SECURITY DEFINER, search_path
-- pinned, _user_id checked against auth.uid() (a caller may only touch their
-- own membership). The update is scoped to the caller's own row and only ever
-- touches tracks_home — no privilege escalation surface. Returns the new
-- tracks_home, or null when the caller isn't a member of the list.

create or replace function public.set_list_tracking(
  _user_id uuid,
  _list_id uuid,
  _enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
  declare
    _result boolean;
  begin
    -- Caller may only change their own membership.
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
  $function$;

grant execute on function public.set_list_tracking(uuid, uuid, boolean) to authenticated;
