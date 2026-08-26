DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname IN ('monthly-reset-last-day','monthly-reset-daily') LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'monthly-reset-last-day',
  '28 17 28-31 * *',
  $cron$
  SELECT CASE
    WHEN ((now() AT TIME ZONE 'Asia/Yangon')::date + 1) = date_trunc('month', (now() AT TIME ZONE 'Asia/Yangon')::date + 1)::date
    THEN net.http_post(
      url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/monthly-reset',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || public.get_cron_secret()
      ),
      body := '{}'::jsonb
    )
    ELSE NULL::bigint
  END;
  $cron$
);