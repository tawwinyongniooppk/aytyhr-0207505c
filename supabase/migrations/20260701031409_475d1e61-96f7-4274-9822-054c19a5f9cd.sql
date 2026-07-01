
-- 1) Remove bonus_transactions delete from monthly reset (bonus should persist)
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
  v_end_date date := (p_month + INTERVAL '1 month')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- NOTE: bonus_transactions intentionally NOT deleted; admin-set bonus persists
  -- across months until the admin changes it. Same for salaries.bonus which is
  -- carried into next month by seed_monthly_salaries.
  DELETE FROM public.salaries WHERE month = p_month;
  DELETE FROM public.leave_manual_deductions WHERE created_at >= v_start AND created_at < v_end;
  DELETE FROM public.salary_manual_additions WHERE month = p_month;
  DELETE FROM public.salary_manual_deductions WHERE created_at >= v_start AND created_at < v_end;
  DELETE FROM public.attendance WHERE date >= v_start_date AND date < v_end_date;
  DELETE FROM public.leave_requests WHERE date >= v_start_date AND date < v_end_date;
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

-- 2) Seed next month's salaries but CARRY OVER the previous month's admin-set bonus
CREATE OR REPLACE FUNCTION public.seed_monthly_salaries(p_month date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted int := 0;
  v_prev_month date := (p_month - INTERVAL '1 month')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH ins AS (
    INSERT INTO public.salaries (user_id, month, base_salary, current_salary, total_deductions, bonus, manual_deduction)
    SELECT
      p.id,
      p_month,
      COALESCE(p.base_salary, 0),
      COALESCE(p.base_salary, 0) + COALESCE(prev.bonus, 0),
      0,
      COALESCE(prev.bonus, 0),
      0
    FROM public.profiles p
    LEFT JOIN public.salaries prev
      ON prev.user_id = p.id AND prev.month = v_prev_month
    WHERE p.role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM public.salaries s WHERE s.user_id = p.id AND s.month = p_month
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$function$;
