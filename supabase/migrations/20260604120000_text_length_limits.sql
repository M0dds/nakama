-- Nakama · L-1: length caps on user free-text fields (security audit 2026-06-03)
-- Run in Supabase Dashboard → SQL Editor → New Query → Run. Idempotent.
--
-- Context: no free-text input (list name/description, display_name, note body/
-- url) had a maxlength, a client length check, OR a DB length constraint. The
-- mutations only .trim() + reject empty. Via the public anon key (subject only
-- to the is_list_member / profiles_update_own RLS), a member of a shared list
-- could persist a multi-MB string into a shared list name / note / display_name
-- that every co-member's client then fetches and renders → localized DoS / UI
-- break + DB bloat. (NOT an XSS: Solid auto-escapes the JSX text, and note links
-- go through normalizeUrl — confirmed safe; this is purely a size/abuse vector.)
--
-- Fix: DB CHECK constraints make the server authoritative on length. The caps
-- are generous so legitimate input never hits them; the paired `maxlength`
-- attributes in the frontend inputs (separate change) keep the limit a clean UX
-- bound rather than a raw DB error.
--
-- These tables live across repos on the shared DB (lists/profiles in the Logbook
-- core schema, item_notes in this repo) but ALTER TABLE targets the live table
-- regardless of which migration created it.

-- lists.name / lists.description
alter table public.lists drop constraint if exists lists_name_len;
alter table public.lists
  add constraint lists_name_len check (char_length(name) <= 120);
alter table public.lists drop constraint if exists lists_description_len;
alter table public.lists
  add constraint lists_description_len
  check (description is null or char_length(description) <= 500);

-- profiles.display_name
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 80);

-- item_notes.body (text content OR link label) + item_notes.url (link target)
alter table public.item_notes drop constraint if exists item_notes_body_len;
alter table public.item_notes
  add constraint item_notes_body_len check (char_length(body) <= 5000);
alter table public.item_notes drop constraint if exists item_notes_url_len;
alter table public.item_notes
  add constraint item_notes_url_len
  check (url is null or char_length(url) <= 2048);
