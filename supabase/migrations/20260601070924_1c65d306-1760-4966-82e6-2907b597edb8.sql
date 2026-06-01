-- Schedule auto-submit-missed-leave to run every 5 minutes.
-- The edge function is idempotent (one auto-submission per user per day).
DO $$
BEGIN
  PERFORM cron.unschedule('auto-submit-missed-leave-every-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-submit-missed-leave-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-submit-missed-leave',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJib3B5eGVxbHltdG5kdG9taXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTc2MTUsImV4cCI6MjA4OTMzMzYxNX0.4251wp5owUMXn6z8Ew8tHM04V-aGd24G94itJMZG5g4'
    ),
    body := '{}'::jsonb
  );
  $$
);