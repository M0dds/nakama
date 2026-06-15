-- ============================================================================
-- Push Phase 2 — schedule the notify-new-episodes Edge Function via pg_cron.
-- ============================================================================
-- pg_cron fires every 4h and pg_net does an async HTTP POST to the function.
-- The function does the detection + sending (it owns the web-push lib + VAPID)
-- and reads the DB with its auto-injected SUPABASE_SERVICE_ROLE_KEY env.
--
-- AUTH: the function is deployed with `--no-verify-jwt` (this project uses the
-- new sb_publishable/sb_secret key format, which is NOT a JWT, so the gateway's
-- verify_jwt can't be relied on). The ONLY gate is the shared secret below.
--
-- SECRET (never inline — created by the user in the SQL editor via Vault):
--   select vault.create_secret('<random-shared-secret>', 'notify_cron_secret');
-- The same value is set as the NOTIFY_CRON_SECRET function env. The cron body
-- reads the Vault secret lazily (only when the job FIRES), so creating it right
-- after this migration is fine.
--
-- The function URL embeds the project ref (jpelluhagtkvpslbzujs) — that ref is
-- public (it's in the client bundle's SUPABASE_URL), so embedding it is fine.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- cron.schedule(name, schedule, command) creates-or-updates by name, so
-- re-running this migration just refreshes the job. Every 4h at minute :07
-- (offset from the hour to avoid the top-of-hour stampede).
select cron.schedule(
  'notify-new-episodes',
  '7 */4 * * *',
  $cron$
  select net.http_post(
    url := 'https://jpelluhagtkvpslbzujs.supabase.co/functions/v1/notify-new-episodes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Notify-Secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'notify_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
