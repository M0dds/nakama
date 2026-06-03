-- Nakama · M-2: enforce @handle format + case-uniqueness at the DB (security audit 2026-06-03)
-- Run in Supabase Dashboard → SQL Editor → New Query → Run. Idempotent.
--
-- Context: the @handle rule ^[a-z0-9._-]{3,30}$ lives only in client code
-- (profile.ts setUsername) and the username_available RPC — but the ACTUAL
-- write is a direct PostgREST UPDATE on profiles, gated only by profiles_update_own
-- (auth.uid() = user_id), with NO column-value CHECK. Since the anon key + URL
-- are public, an attacker can UPDATE their own handle directly to whitespace,
-- Unicode confusables, control chars, empty, or a 50KB string — defeating the
-- app's anti-spoofing design (UserChip trusts the handle as the unique, clean
-- identifier). Worse, the UNIQUE index is on raw `username` while the availability
-- check compares lower(username), so 'Alice' and 'alice' can coexist if the
-- client normalization is bypassed.
--
-- Fix: the server must enforce exactly what the client claims —
--   (1) a CHECK constraint mirroring the client regex (format + length), and
--   (2) a UNIQUE index on lower(username) so case-variants can't coexist.
-- The client always normalizes to lowercase + validates before writing, so
-- legitimate writes pass untouched; only direct-API tampering is rejected.
--
-- NOTE: existing usernames were all created through the client regex, so the
-- CHECK validates clean. The lower(username) unique index will fail to build
-- only if two case-variant handles already exist — at current scale (couples /
-- small friend groups) there are none; if it errors, dedupe first.

-- (1) Format + length CHECK — mirrors the client regex exactly.
alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9._-]{3,30}$');

-- (2) Case-insensitive uniqueness. The raw-column UNIQUE from the base schema
-- stays (harmless + redundant for already-lowercased data); this index is the
-- one that closes the 'Alice' vs 'alice' gap against direct-API writes.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));
