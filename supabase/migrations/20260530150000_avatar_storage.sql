-- ============================================================================
-- Avatar storage — bucket + RLS so users can upload their own profile picture.
--
-- Logbook never built direct upload (it stored an external image URL in
-- profiles.avatar_url). Nakama adds a real upload: a public `avatars` bucket,
-- one folder per user keyed on auth.uid(), and the resulting public URL is
-- written back into profiles.avatar_url (guarded by the existing
-- profiles_update_own policy — no profiles change needed here).
--
-- Path convention (enforced by the policies below): `<auth.uid()>/<file>`.
-- The app uploads to `<uid>/avatar.<ext>` with upsert + a cache-busting query
-- param on the stored URL, so re-uploads overwrite in place (no orphans).
-- ============================================================================

-- Public bucket: avatars are shown to co-members in the roster + logbuch feed,
-- so reads must not require a signed URL. Writes are still locked down below.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone (incl. anon) may read avatar objects — the bucket is public.
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- A user may write only inside their own `<uid>/` folder. storage.foldername()
-- splits the object name on '/'; [1] is the first segment (1-indexed arrays).
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
