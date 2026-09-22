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
  DELETE FROM public.salary_manual_deductions
  WHERE month = p_month AND source = 'partial_leave';
  DELETE FROM public.attendance WHERE date >= v_start_date AND date < v_end_date;

  DELETE FROM public.leave_requests
  WHERE type = 'partial_leave'
    AND date >= v_start_date
    AND date < v_end_date;

  -- OT-3B-4: MMT calendar-month membership instead of UTC bounds
  DELETE FROM public.overtime_requests
  WHERE date_trunc('month', start_at AT TIME ZONE 'Asia/Yangon')::date = p_month;

  DELETE FROM public.calendar_event_assignments
  WHERE event_id IN (
    SELECT id FROM public.calendar_events
    WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date
  );
  DELETE FROM public.calendar_events
  WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date;
  DELETE FROM public.tasks WHERE created_at >= v_start AND created_at < v_end;

  PERFORM public.purge_old_leave_logs();
  PERFORM public.purge_old_salary_logs();
  PERFORM public.purge_old_task_logs();
END;
$function$;