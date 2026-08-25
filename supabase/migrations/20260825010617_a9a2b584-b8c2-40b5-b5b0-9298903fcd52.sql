DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid
  FROM cron.job
  WHERE jobname = 'auto-weekly-task-credit';

  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'auto-weekly-task-credit',
  '25 17 3,10,17,24 * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-weekly-task-credit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', public._get_cron_secret())
    ),
    body := '{}'::jsonb
  );
  $cmd$
);