-- 1) Fix double-deduction: drop the legacy duplicate trigger on leave_manual_deductions.
-- Both `manual_deduction_balance_trigger` and `trg_apply_manual_deduction_change` were
-- firing the same function on INSERT/DELETE, causing balance to drop by 2× the entered days.
DROP TRIGGER IF EXISTS manual_deduction_balance_trigger ON public.leave_manual_deductions;

-- 2) Schedule auto-weekly-task-credit edge function.
-- Run at 17:30 UTC on day-of-month 2,9,16,23 → that is 00:00 MMT on day 3,10,17,24.
DO $$
BEGIN
  PERFORM cron.unschedule('auto-weekly-task-credit');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-weekly-task-credit',
  '30 17 2,9,16,23 * *',
  $$
  SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-weekly-task-credit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJib3B5eGVxbHltdG5kdG9taXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NTc2MTUsImV4cCI6MjA4OTMzMzYxNX0.4251wp5owUMXn6z8Ew8tHM04V-aGd24G94itJMZG5g4'
    ),
    body := '{}'::jsonb
  );
  $$
);