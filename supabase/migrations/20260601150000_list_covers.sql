-- ============================================================================
-- List covers — every list gets a cover image.
--
-- Default: a generated themed pattern rendered client-side from a `cover_seed`
-- (no image stored — see GeneratedCover.tsx). Optional: an owner-uploaded
-- custom image whose public URL is written to `cover_url` (overrides the
-- generated one). Mirrors the avatar storage setup, but the per-folder owner is
-- the LIST OWNER, not the uploader — only the owner may change a list's cover
-- (consistent with rename / member-removal being owner-only, PRELAUNCH-2).
--
-- cover_url writes go through the lists table itself, already guarded by the
-- owner-only `lists_update_owner` policy — no extra table policy needed here.
--
-- Storage path convention: `<list_id>/cover.<ext>` in the `list-covers` bucket.
-- ============================================================================

-- 1 · Columns -----------------------------------------------------------------
alter table public.lists add column if not exists cover_url  text;
alter table public.lists add column if not exists cover_seed bigint;

-- Backfill existing lists with a random seed so they render a generated cover.
update public.lists
   set cover_seed = (floor(random() * 1000000000))::bigint
 where cover_seed is null;

-- New lists get a random seed by default (createList relies on this — it does
-- not send a seed). random() is volatile, so each insert gets its own.
alter table public.lists
  alter column cover_seed set default (floor(random() * 1000000000))::bigint;

-- 2 · Storage bucket ----------------------------------------------------------
-- Public read (covers show in the lists overview without a signed URL).
insert into storage.buckets (id, name, public)
values ('list-covers', 'list-covers', true)
on conflict (id) do nothing;

drop policy if exists "list_covers_public_read" on storage.objects;
create policy "list_covers_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'list-covers');

-- Writes only by the OWNER of the list whose id is the object's top folder.
-- (storage.foldername(name))[1] is the first path segment = the list_id.
drop policy if exists "list_covers_insert_owner" on storage.objects;
create policy "list_covers_insert_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'list-covers'
    and exists (
      select 1 from public.lists l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and l.owner_id = auth.uid()
    )
  );

drop policy if exists "list_covers_update_owner" on storage.objects;
create policy "list_covers_update_owner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'list-covers'
    and exists (
      select 1 from public.lists l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and l.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'list-covers'
    and exists (
      select 1 from public.lists l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and l.owner_id = auth.uid()
    )
  );

drop policy if exists "list_covers_delete_owner" on storage.objects;
create policy "list_covers_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'list-covers'
    and exists (
      select 1 from public.lists l
      where l.id::text = (storage.foldername(storage.objects.name))[1]
        and l.owner_id = auth.uid()
    )
  );
