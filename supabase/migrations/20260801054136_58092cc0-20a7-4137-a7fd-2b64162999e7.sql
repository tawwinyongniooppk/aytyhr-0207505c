CREATE OR REPLACE FUNCTION public.compute_attendance_late_minutes_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    SELECT value INTO v_expected
    FROM public.app_settings
    WHERE key = 'start_time';
  END IF;
  v_expected := COALESCE(NULLIF(v_expected, ''), '09:00');

  v_expected_min := split_part(v_expected, ':', 1)::integer * 60
                  + split_part(v_expected, ':', 2)::integer;
  v_checkin_min := extract(hour from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::integer * 60
                 + extract(minute from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::integer;
  v_raw_late := GREATEST(0, v_checkin_min - v_expected_min);

  -- Exactly three minutes are free. Automatic per-minute payroll applies only
  -- to the interval after +3 through +30, for a maximum of 27 charged minutes.
  -- Leave records intentionally do not alter check-in lateness.
  NEW.late_minutes := GREATEST(0, LEAST(v_raw_late, v_auto_window_end) - v_grace);
  NEW.early_minutes := 0;
  NEW.deduction_applied := false;
  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'attendance-missed-leave-sweep-every-5min'
       OR command ILIKE '%auto-submit-missed-leave%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
END;
$$;