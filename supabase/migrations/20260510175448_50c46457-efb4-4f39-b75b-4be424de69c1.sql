-- Enable required extensions for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Retention purge for salary-related logs only
CREATE OR REPLACE FUNCTION public.purge_old_salary_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff date;
BEGIN
  -- Keep current month + first 2 days of the next month.
  -- On day 3+, cutoff becomes the start of the current month
  -- (anything strictly before that is purged).
  IF extract(day FROM CURRENT_DATE)::int <= 2 THEN
    cutoff := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date;
  ELSE
    cutoff := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  -- Salary, Bonus, Auto Deduction, Manual Salary Deduction logs (per-month rows)
  DELETE FROM public.salaries WHERE month < cutoff;

  -- Manual leave-day deduction logs
  DELETE FROM public.leave_manual_deductions WHERE created_at < cutoff;
END;
$$;

-- Unschedule any prior version of this job, then (re)schedule daily at 00:05 UTC
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'purge-old-salary-logs';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'purge-old-salary-logs',
  '5 0 * * *',
  $$ SELECT public.purge_old_salary_logs(); $$
);