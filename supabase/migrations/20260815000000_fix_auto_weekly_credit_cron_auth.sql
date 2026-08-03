-- ROOT CAUSE: auto-weekly-task-credit's cron job authenticates with
--   'Bearer ' || current_setting('app.settings.cron_secret', true)
-- current_setting('app.settings.*') is a per-SESSION custom GUC. pg_cron's
-- background worker sessions never had this GUC set (it was only ever set,
-- if at all, in interactive/migration sessions), so current_setting(...,true)
-- silently returns NULL. NULL || anything = NULL, so every checkpoint fired
-- an Authorization header of "Bearer " (empty) or a NULL header, which the
-- edge function's isPrivileged check always rejects with 401 Unauthorized.
-- This is why auto-weekly credits have failed at every 3rd/10th/17th/24th
-- 23:55 MMT checkpoint for ALL staff, silently (net.http_post is fire-and-
-- forget; failures only appear in cron.job_run_details, never surfaced to
-- admins) — while other cron jobs (auto-checkout, missed-leave sweeps,
-- monthly-reset) were already migrated in 20260615134623 to a literal/shared
-- secret and kept working. auto-weekly-task-credit was missed in that pass.
--
-- Additionally, migration 20260617010631 introduced a NEW job
-- ('attendance-missed-leave-sweep-every-5min') that calls
-- public._get_cron_secret(), a function that was never defined anywhere in
-- the migration history — so that job has been erroring on every run too
-- ("function public._get_cron_secret() does not exist"), invisibly.
--
-- FIX: define public._get_cron_secret() as the single source of truth for
-- the cron bearer secret (matches CRON_SECRET configured on every relevant
-- edge function), then repoint BOTH broken jobs at it.

CREATE OR REPLACE FUNCTION public._get_cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'Iloveyamin123@'::text;
$$;

-- 1) Re-point the already-broken 5-min missed-leave sweep at the (now real) helper.
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'attendance-missed-leave-sweep-every-5min';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'attendance-missed-leave-sweep-every-5min',
  '*/5 * * * *',
  $cmd$SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-submit-missed-leave',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' || public._get_cron_secret() || '"}')::jsonb,
    body := '{}'::jsonb
  );$cmd$
);

-- 2) Fix the actual reported bug: auto-weekly-task-credit checkpoint job.
-- Schedule itself ('25 17 3,10,17,24 * *' = 23:55 MMT on the 3rd/10th/17th/24th,
-- since pg_cron runs in UTC and MMT = UTC+6:30) is correct and unchanged —
-- only the broken auth header is replaced.
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'auto-weekly-task-credit';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'auto-weekly-task-credit',
  '25 17 3,10,17,24 * *',
  $cmd$SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-weekly-task-credit',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' || public._get_cron_secret() || '"}')::jsonb,
    body := '{}'::jsonb
  );$cmd$
);
