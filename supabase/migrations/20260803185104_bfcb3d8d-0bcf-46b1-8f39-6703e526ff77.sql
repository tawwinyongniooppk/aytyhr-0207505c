CREATE OR REPLACE FUNCTION public.verify_cron_secret(p_candidate text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT COALESCE(
    p_candidate IS NOT NULL
    AND length(p_candidate) >= 16
    AND p_candidate = (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'CRON_SECRET'
      ORDER BY created_at DESC
      LIMIT 1
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'auto-weekly-task-credit';

SELECT cron.schedule(
  'auto-weekly-task-credit',
  '25 17 3,10,17,24 * *',
  $cron$
  SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-weekly-task-credit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', public._get_cron_secret())
    ),
    body := '{}'::jsonb
  );
  $cron$
);