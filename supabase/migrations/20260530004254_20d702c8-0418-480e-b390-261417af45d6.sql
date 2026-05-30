
-- Extend monthly_reset_for to wipe attendance, tasks, and task-type calendar events for the month
CREATE OR REPLACE FUNCTION public.monthly_reset_for(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := p_month::timestamptz;
  v_end   timestamptz := (p_month + INTERVAL '1 month')::timestamptz;
  v_start_date date := p_month;
  v_end_date date := (p_month + INTERVAL '1 month')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Salary & bonus logs
  DELETE FROM public.bonus_transactions WHERE month = p_month;
  DELETE FROM public.salaries WHERE month = p_month;

  -- Manual leave-day deduction logs created in that month
  DELETE FROM public.leave_manual_deductions
    WHERE created_at >= v_start AND created_at < v_end;

  -- Attendance logs for the month
  DELETE FROM public.attendance
    WHERE date >= v_start_date AND date < v_end_date;

  -- Leave requests for the month (logs only — leave_balances are untouched)
  DELETE FROM public.leave_requests
    WHERE date >= v_start_date AND date < v_end_date;

  -- Task-type calendar events for the month and their assignments
  DELETE FROM public.calendar_event_assignments
    WHERE event_id IN (
      SELECT id FROM public.calendar_events
      WHERE event_type = 'task'
        AND start_date >= v_start_date AND start_date < v_end_date
    );
  DELETE FROM public.calendar_events
    WHERE event_type = 'task'
      AND start_date >= v_start_date AND start_date < v_end_date;

  -- Standalone tasks created in the month
  DELETE FROM public.tasks
    WHERE created_at >= v_start AND created_at < v_end;
END;
$$;

-- Aggregated monthly attendance stats for admin dashboard
CREATE OR REPLACE FUNCTION public.dashboard_monthly_attendance(p_month_start date, p_month_end date)
RETURNS TABLE(
  user_id uuid,
  total_late_minutes bigint,
  total_early_minutes bigint,
  days_present bigint,
  late_cases bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    a.user_id,
    COALESCE(SUM(a.late_minutes), 0)::bigint,
    COALESCE(SUM(a.early_minutes), 0)::bigint,
    COUNT(*) FILTER (WHERE a.check_in_time IS NOT NULL)::bigint,
    COUNT(*) FILTER (WHERE a.late_minutes > 0)::bigint
  FROM public.attendance a
  WHERE a.date >= p_month_start AND a.date <= p_month_end
  GROUP BY a.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_monthly_attendance(date, date) TO authenticated;
