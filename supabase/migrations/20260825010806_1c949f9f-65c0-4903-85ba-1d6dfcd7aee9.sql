SELECT net.http_post(
  url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-weekly-task-credit',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', concat('Bearer ', public._get_cron_secret()),
    'x-force-window', '2026-08-24'
  ),
  body := '{}'::jsonb
);