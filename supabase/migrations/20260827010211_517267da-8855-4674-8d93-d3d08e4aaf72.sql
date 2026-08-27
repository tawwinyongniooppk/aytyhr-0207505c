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
  v_morning_half boolean;
  v_grace constant integer := 5;
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

  -- Morning Half-Leave (pending or approved) shifts the expected check-in to 12:00 MMT.
  SELECT EXISTS (
    SELECT 1 FROM public.leave_requests lr
    WHERE lr.user_id = NEW.user_id
      AND lr.date = COALESCE(NEW.date, (NEW.check_in_time AT TIME ZONE 'Asia/Yangon')::date)
      AND lr.type = 'half_leave'
      AND lr.half_period = 'morning'
      AND lr.status <> 'rejected'
  ) INTO v_morning_half;

  IF v_morning_half THEN
    v_expected := '12:00';
  END IF;

  v_expected_min := split_part(v_expected, ':', 1)::integer * 60
                  + split_part(v_expected, ':', 2)::integer;
  v_checkin_min := extract(hour from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::integer * 60
                 + extract(minute from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::integer;
  v_raw_late := GREATEST(0, v_checkin_min - v_expected_min);

  NEW.late_minutes := GREATEST(0, v_raw_late - v_grace);

  NEW.early_minutes := 0;
  NEW.deduction_applied := false;
  RETURN NEW;
END;
$$;