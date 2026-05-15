-- Enable pg_cron for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cleanup function: keep current month + first 2 days of new month
CREATE OR REPLACE FUNCTION public.purge_old_task_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff date;
  cutoff_iso timestamptz;
BEGIN
  -- On day 1-2 of the month, keep previous month (cutoff = start of previous month).
  -- On day 3+, purge previous month (cutoff = start of current month).
  IF extract(day FROM CURRENT_DATE)::int <= 2 THEN
    cutoff := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date;
  ELSE
    cutoff := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  cutoff_iso := cutoff::timestamptz;

  -- Delete task assignments tied to old task-type calendar events
  DELETE FROM public.calendar_event_assignments
  WHERE event_id IN (
    SELECT id FROM public.calendar_events
    WHERE event_type = 'task' AND start_date < cutoff
  );

  -- Delete old task-type calendar events
  DELETE FROM public.calendar_events
  WHERE event_type = 'task' AND start_date < cutoff;

  -- Delete old standalone tasks
  DELETE FROM public.tasks
  WHERE created_at < cutoff_iso;
END;
$$;

-- Unschedule previous job if it exists, then schedule daily at 02:00 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-task-logs-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-old-task-logs-daily',
  '0 2 * * *',
  $$ SELECT public.purge_old_task_logs(); $$
);