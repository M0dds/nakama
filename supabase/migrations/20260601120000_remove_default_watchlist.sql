-- Nakama · stop auto-creating a "Watchlist" on signup
-- Run in Supabase Dashboard → SQL Editor → New Query → Run. Idempotent
-- (create or replace).
--
-- Why: new users should start on an EMPTY canvas. The dashboard empty states
-- now explain each section and point to the Listen tab so the user creates
-- their first list themselves. An auto-created "Watchlist" made those hints
-- misleading ("browse your Watchlist") and pre-seeded a list the user never
-- chose.
--
-- This re-defines handle_new_user() WITHOUT the `insert into public.lists`
-- step that Logbook migration 20260528160000 added. The profiles insert is
-- preserved verbatim (username derivation via unique_username/derive_username
-- unchanged). Existing "Watchlist" rows are untouched — this only changes what
-- FUTURE signups get; it does not delete anyone's data.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;
