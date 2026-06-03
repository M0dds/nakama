-- ============================================================================
-- Item notes — a shared notes board per (list, item).
-- ============================================================================
-- A new "Notizen" section on the item detail page (section 03, under Details).
-- Notes are a LIST of blocks; each block is either free text or a named link
-- (label + url, rendered as a clickable pill). They're shared with the members
-- of the list the item is opened through — the list is the app's sharing unit,
-- so RLS is the usual is_list_member() gate (no new helper needed). A private
-- list has one member, so it doubles as a private board there.
--
-- Scoped to (list_id, item_id): the same item in two lists has two boards. The
-- UI only shows the section when the item is opened via a list (list-scoped
-- route) — the global item page has no single list to attach to, like the sync
-- toggle / co-watcher eye.
--
-- Visibility: any list member reads + adds; a member can edit/delete only their
-- OWN blocks (collaborative board, no edit-wars). author_user_id is the block's
-- owner + attribution.
-- ============================================================================

create table if not exists public.item_notes (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('text', 'link')),
  -- text block: the note text. link block: the link LABEL (the short clickable
  -- text). A link's target lives in `url`; a text block leaves `url` null.
  body text not null,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a link must carry a url; a text block must not
  constraint item_notes_link_has_url check (
    (kind = 'link' and url is not null) or (kind = 'text' and url is null)
  )
);

create index if not exists item_notes_list_item_idx
  on public.item_notes (list_id, item_id, created_at);

alter table public.item_notes enable row level security;

-- Read: any member of the list (is_list_member is the SECURITY DEFINER helper
-- used across the schema; it bypasses RLS so the membership check doesn't
-- recurse).
drop policy if exists "item_notes_select_member" on public.item_notes;
create policy "item_notes_select_member" on public.item_notes for select to authenticated
  using (public.is_list_member(list_id, auth.uid()));

-- Insert: members only, author must be the caller.
drop policy if exists "item_notes_insert_member" on public.item_notes;
create policy "item_notes_insert_member" on public.item_notes for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and public.is_list_member(list_id, auth.uid())
  );

-- Update / delete: own blocks only (and still a member).
drop policy if exists "item_notes_update_own" on public.item_notes;
create policy "item_notes_update_own" on public.item_notes for update to authenticated
  using (author_user_id = auth.uid() and public.is_list_member(list_id, auth.uid()))
  with check (author_user_id = auth.uid());

drop policy if exists "item_notes_delete_own" on public.item_notes;
create policy "item_notes_delete_own" on public.item_notes for delete to authenticated
  using (author_user_id = auth.uid() and public.is_list_member(list_id, auth.uid()));

grant select, insert, update, delete on public.item_notes to authenticated;

-- updated_at trigger (set_updated_at exists from the Logbook core schema).
drop trigger if exists on_item_notes_updated on public.item_notes;
create trigger on_item_notes_updated
  before update on public.item_notes
  for each row execute function public.set_updated_at();

-- Live board: let postgres_changes on item_notes reach clients (RLS still
-- scopes which rows each client receives). Guarded so re-running is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'item_notes'
  ) then
    alter publication supabase_realtime add table public.item_notes;
  end if;
end $$;
