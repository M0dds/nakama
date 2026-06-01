-- ============================================================================
-- Fix list-cover storage write policies — qualify the object name.
--
-- The 20260601150000 policies referenced `name` UNQUALIFIED inside a subquery
-- over public.lists. lists ALSO has a `name` column, so Postgres bound `name`
-- to lists.name (the list's title, e.g. "Test1") instead of the storage
-- object's path. storage.foldername('Test1') is {'Test1'}, so
-- `l.id::text = 'Test1'` was never true → exists() was always false → every
-- cover upload got 403 "new row violates row-level security policy", even for
-- the list owner. Qualify it as storage.objects.name so it correlates to the
-- object being written. (The avatar policy never hit this — it compares to
-- auth.uid()::text directly, no table subquery.)
-- ============================================================================

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
