CREATE OR REPLACE FUNCTION public.monthly_reset_for(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := p_month::timestamptz;
  v_end   timestamptz := (p_month + INTERVAL '1 month')::timestamptz;
  v_start_date date := p_month;
  v_end_date   date := (p_month + INTERVAL '1 month')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM public.rollup_yearly_bonus_progress(p_month);

  UPDATE public.profiles p
  SET bonus_amount = COALESCE(s.bonus, p.bonus_amount)
  FROM public.salaries s
  WHERE s.user_id = p.id AND s.month = p_month;

  DELETE FROM public.salaries WHERE month = p_month;
  DELETE FROM public.salary_manual_additions WHERE month = p_month;
  DELETE FROM public.attendance WHERE date >= v_start_date AND date < v_end_date;

  -- Retain full-day/half-day leave history for the complete June-May leave year.
  -- Partial leave is transactional and remains part of the monthly cleanup.
  DELETE FROM public.leave_requests
  WHERE type = 'partial_leave'
    AND date >= v_start_date
    AND date < v_end_date;

  DELETE FROM public.overtime_requests WHERE start_at >= v_start AND start_at < v_end;
  DELETE FROM public.calendar_event_assignments
    WHERE event_id IN (
      SELECT id FROM public.calendar_events
      WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date
    );
  DELETE FROM public.calendar_events
    WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date;
  DELETE FROM public.tasks WHERE created_at >= v_start AND created_at < v_end;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_old_leave_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cutoff date;
BEGIN
  IF extract(day FROM (now() AT TIME ZONE 'Asia/Yangon'))::int <= 2 THEN
    cutoff := (date_trunc('month', (now() AT TIME ZONE 'Asia/Yangon')) - INTERVAL '1 month')::date;
  ELSE
    cutoff := date_trunc('month', (now() AT TIME ZONE 'Asia/Yangon'))::date;
  END IF;

  -- Only partial leave follows monthly transaction-log retention.
  DELETE FROM public.leave_requests
  WHERE type = 'partial_leave' AND date < cutoff;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_old_salary_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cutoff date;
BEGIN
  IF extract(day FROM (now() AT TIME ZONE 'Asia/Yangon'))::int <= 2 THEN
    cutoff := (date_trunc('month', (now() AT TIME ZONE 'Asia/Yangon')) - INTERVAL '1 month')::date;
  ELSE
    cutoff := date_trunc('month', (now() AT TIME ZONE 'Asia/Yangon'))::date;
  END IF;

  DELETE FROM public.salaries WHERE month < cutoff;
  -- Leave manual deductions belong to the June-May leave year, not monthly salary retention.
  DELETE FROM public.salary_manual_additions WHERE month < cutoff;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_leave_balances_yearly()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  yangon_today date;
  new_period date;
BEGIN
  yangon_today := (now() AT TIME ZONE 'Asia/Yangon')::date;

  -- The cron runs May 31 at 23:59 MMT, one minute before the new leave year.
  IF extract(month FROM yangon_today)::int = 5 AND extract(day FROM yangon_today)::int = 31 THEN
    new_period := make_date(extract(year FROM yangon_today)::int, 6, 1);
  ELSE
    new_period := make_date(
      CASE WHEN extract(month FROM yangon_today)::int >= 6
           THEN extract(year FROM yangon_today)::int
           ELSE extract(year FROM yangon_today)::int - 1 END,
      6, 1
    );
  END IF;

  UPDATE public.leave_balances
  SET balance = 10, period_start = new_period, updated_at = now()
  WHERE period_start < new_period;

  -- Clear the completed leave year's retained staff requests and manual leave deductions.
  DELETE FROM public.leave_requests WHERE date < new_period;
  DELETE FROM public.leave_manual_deductions WHERE created_at < new_period::timestamptz;

  DELETE FROM public.leave_balances
  WHERE period_start < (new_period - INTERVAL '1 year')::date;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.monthly_reset_for(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_leave_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_salary_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_leave_balances_yearly() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_reset_for(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_leave_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_old_salary_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_leave_balances_yearly() TO service_role;