-- 1) Late minutes: beyond +30 => no automatic charge (admin manual only)
CREATE OR REPLACE FUNCTION public.compute_attendance_late_minutes_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_day_name text;
  v_expected text;
  v_expected_min integer;
  v_checkin_min integer;
  v_raw_late integer;
  v_day jsonb;
  v_grace constant integer := 3;
  v_auto_window_end constant integer := 30;
BEGIN
  IF NEW.check_in_time IS NULL THEN
    NEW.late_minutes := 0;
    NEW.early_minutes := 0;
    NEW.deduction_applied := false;
    RETURN NEW;
  END IF;

  SELECT work_day, check_in_time, work_schedule
    INTO v_profile
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF NOT FOUND THEN
    NEW.late_minutes := 0;
    NEW.early_minutes := 0;
    NEW.deduction_applied := false;
    RETURN NEW;
  END IF;

  v_day_name := to_char(COALESCE(NEW.date, (NEW.check_in_time AT TIME ZONE 'Asia/Yangon')::date), 'FMDay');
  v_day := v_profile.work_schedule -> v_day_name;

  IF v_day IS NOT NULL THEN
    IF COALESCE((v_day ->> 'active')::boolean, true) = false THEN
      NEW.late_minutes := 0;
      NEW.early_minutes := 0;
      NEW.deduction_applied := false;
      RETURN NEW;
    END IF;
    v_expected := NULLIF(v_day ->> 'check_in', '');
  ELSIF v_profile.work_day = v_day_name AND v_profile.check_in_time IS NOT NULL THEN
    v_expected := left(v_profile.check_in_time::text, 5);
  END IF;

  IF v_expected IS NULL THEN
    SELECT value INTO v_expected FROM public.app_settings WHERE key = 'start_time';
  END IF;
  v_expected := COALESCE(NULLIF(v_expected, ''), '09:00');

  v_expected_min := split_part(v_expected, ':', 1)::integer * 60
                  + split_part(v_expected, ':', 2)::integer;
  v_checkin_min := extract(hour from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::integer * 60
                 + extract(minute from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::integer;
  v_raw_late := GREATEST(0, v_checkin_min - v_expected_min);

  IF v_raw_late > v_auto_window_end THEN
    -- Past the +30 boundary the case belongs to the Admin as a manual deduction.
    -- Never clamp to 27 minutes: that silently charged the maximum automatic amount.
    NEW.late_minutes := 0;
  ELSE
    NEW.late_minutes := GREATEST(0, v_raw_late - v_grace);
  END IF;

  NEW.early_minutes := 0;
  NEW.deduction_applied := false;
  RETURN NEW;
END;
$$;

-- 2) Persist per-staff Bonus so the monthly reset cannot clear it
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bonus_amount integer NOT NULL DEFAULT 0;

UPDATE public.profiles p
SET bonus_amount = COALESCE(s.bonus, 0)
FROM (
  SELECT DISTINCT ON (user_id) user_id, bonus
  FROM public.salaries
  ORDER BY user_id, month DESC
) s
WHERE s.user_id = p.id AND p.bonus_amount = 0;

CREATE OR REPLACE FUNCTION public.sync_profile_bonus_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bonus IS DISTINCT FROM COALESCE(OLD.bonus, -1) THEN
    UPDATE public.profiles SET bonus_amount = COALESCE(NEW.bonus, 0) WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_bonus_amount_trg ON public.salaries;
CREATE TRIGGER sync_profile_bonus_amount_trg
AFTER INSERT OR UPDATE OF bonus ON public.salaries
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_bonus_amount();

-- 3) Seed new months from the persisted profile bonus
CREATE OR REPLACE FUNCTION public.seed_monthly_salaries(p_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_prev_month date := (p_month - INTERVAL '1 month')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH ins AS (
    INSERT INTO public.salaries (user_id, month, base_salary, current_salary, total_deductions, bonus, manual_deduction)
    SELECT
      p.id,
      p_month,
      COALESCE(p.base_salary, 0),
      COALESCE(p.base_salary, 0) + COALESCE(prev.bonus, p.bonus_amount, 0),
      0,
      COALESCE(prev.bonus, p.bonus_amount, 0),
      0
    FROM public.profiles p
    LEFT JOIN public.salaries prev ON prev.user_id = p.id AND prev.month = v_prev_month
    WHERE p.role = 'staff'
      AND NOT EXISTS (SELECT 1 FROM public.salaries s WHERE s.user_id = p.id AND s.month = p_month)
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

-- 4) Monthly reset keeps bonuses by snapshotting them before deleting salary rows
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
  v_end_date   date := (p_month + INTERVAL '1 month')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM public.rollup_yearly_bonus_progress(p_month);

  -- Preserve admin-set bonuses on the profile before the salary rows go away
  UPDATE public.profiles p
  SET bonus_amount = COALESCE(s.bonus, p.bonus_amount)
  FROM public.salaries s
  WHERE s.user_id = p.id AND s.month = p_month;

  DELETE FROM public.salaries WHERE month = p_month;
  -- KEEP: leave_manual_deductions & salary_manual_deductions (yearly, not monthly)
  DELETE FROM public.salary_manual_additions WHERE month = p_month;
  DELETE FROM public.attendance          WHERE date     >= v_start_date AND date     < v_end_date;
  DELETE FROM public.leave_requests      WHERE date     >= v_start_date AND date     < v_end_date;
  DELETE FROM public.overtime_requests   WHERE start_at >= v_start      AND start_at < v_end;
  DELETE FROM public.calendar_event_assignments
    WHERE event_id IN (
      SELECT id FROM public.calendar_events
      WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date
    );
  DELETE FROM public.calendar_events
    WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date;
  DELETE FROM public.tasks WHERE created_at >= v_start AND created_at < v_end;
END;
$$;