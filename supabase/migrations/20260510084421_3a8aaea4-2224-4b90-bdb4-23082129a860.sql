
-- Enable extensions for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Purge leave logs older than retention window:
-- keep current month + first 2 days of next month.
-- After day 2 of a month, last month's records are removed.
CREATE OR REPLACE FUNCTION public.purge_old_leave_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff date;
BEGIN
  IF extract(day FROM CURRENT_DATE)::int <= 2 THEN
    cutoff := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date;
  ELSE
    cutoff := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  DELETE FROM public.leave_requests WHERE date < cutoff;
  DELETE FROM public.leave_manual_deductions WHERE created_at < cutoff;
END;
$$;

-- Reset leave balances to 10 on June 1 of each year, and prune balances
-- whose period_start is older than ~1 year from today.
CREATE OR REPLACE FUNCTION public.reset_leave_balances_yearly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_period date;
BEGIN
  current_period := make_date(
    CASE WHEN extract(month FROM CURRENT_DATE)::int >= 6
         THEN extract(year FROM CURRENT_DATE)::int
         ELSE extract(year FROM CURRENT_DATE)::int - 1 END,
    6, 1
  );

  -- Reset on/around June 1 each year
  IF extract(month FROM CURRENT_DATE)::int = 6 AND extract(day FROM CURRENT_DATE)::int = 1 THEN
    UPDATE public.leave_balances
      SET balance = 10, period_start = current_period, updated_at = now()
      WHERE period_start < current_period OR balance <> 10;
  END IF;

  -- Prune balances whose period_start is older than ~1 year
  DELETE FROM public.leave_balances
    WHERE period_start < (CURRENT_DATE - INTERVAL '1 year')::date;
END;
$$;

-- Schedule daily jobs (idempotent: drop existing of same name first)
DO $$
BEGIN
  PERFORM cron.unschedule('purge_old_leave_logs_daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_old_leave_logs_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('reset_leave_balances_daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset_leave_balances_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge_old_leave_logs_daily',
  '15 2 * * *',
  $$ SELECT public.purge_old_leave_logs(); $$
);

SELECT cron.schedule(
  'reset_leave_balances_daily',
  '30 2 * * *',
  $$ SELECT public.reset_leave_balances_yearly(); $$
);
