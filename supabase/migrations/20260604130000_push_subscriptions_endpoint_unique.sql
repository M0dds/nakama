-- Push subscriptions: dedupe by endpoint + add the missing UNIQUE(endpoint).
--
-- push_subscriptions was created as raw SQL (no tracked migration) and the
-- UNIQUE constraint on `endpoint` was missing/ineffective. subscribeToPush()
-- does `.insert(...)` and swallows error 23505 ("already stored") expecting that
-- constraint to fire — but without it, repeated subscribes silently inserted
-- duplicate rows for the SAME endpoint. send-push sends one push per row, so the
-- device received every test/notification twice.
--
-- (a) collapse existing duplicates to one row per endpoint, then
-- (b) add the constraint so the 23505-on-conflict path actually works and no
--     duplicate can recur (and a future upsert-on-endpoint would have a target).

-- (a) Keep one row per endpoint, drop the rest. `ctid` is row-unique, so this is
--     schema-agnostic — no assumption about the primary-key column name/type.
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.endpoint = b.endpoint
  AND a.ctid < b.ctid;

-- (b) From now on an endpoint maps to exactly one subscription row.
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
