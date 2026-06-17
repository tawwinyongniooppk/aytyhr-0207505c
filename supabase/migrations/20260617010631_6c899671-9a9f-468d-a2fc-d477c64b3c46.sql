CREATE OR REPLACE FUNCTION public.compute_attendance_late_minutes_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile record;
  v_day_name text;
  v_expected text;
  v_expected_min int;
  v_checkin_min int;
  v_grace int;
  v_has_paid_excuse boolean;
  v_day jsonb;
BEGIN
  IF NEW.check_in_time IS NULL THEN
    NEW.late_minutes := 0;
    NEW.early_minutes := 0;
    NEW.deduction_applied := false;
    RETURN NEW;
  END IF;

  SELECT role, work_day, check_in_time, work_schedule
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

  SELECT COALESCE(NULLIF(value, '')::int, 0)
    INTO v_grace
  FROM public.app_settings
  WHERE key = 'grace_period_minutes';
  v_grace := COALESCE(v_grace, 0);

  SELECT EXISTS (
    SELECT 1
    FROM public.leave_requests lr
    WHERE lr.user_id = NEW.user_id
      AND lr.date = NEW.date
      AND lr.status = 'approved'
      AND COALESCE(lr.payment_type, 'paid') = 'paid'
      AND lr.type IN ('leave', 'late_excuse')
  ) OR EXISTS (
    SELECT 1
    FROM public.leave_requests lr
    WHERE lr.user_id = NEW.user_id
      AND lr.date = NEW.date
      AND lr.status <> 'rejected'
      AND lr.type = 'half_leave'
      AND lr.half_period = 'morning'
  )
    INTO v_has_paid_excuse;

  IF v_has_paid_excuse THEN
    NEW.late_minutes := 0;
  ELSE
    v_expected_min := split_part(v_expected, ':', 1)::int * 60 + split_part(v_expected, ':', 2)::int;
    v_checkin_min := extract(hour from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::int * 60
                   + extract(minute from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::int;
    NEW.late_minutes := GREATEST(0, v_checkin_min - (v_expected_min + v_grace));
  END IF;

  NEW.early_minutes := 0;
  NEW.deduction_applied := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zzz_compute_attendance_late_minutes_on_insert ON public.attendance;
CREATE TRIGGER zzz_compute_attendance_late_minutes_on_insert
BEFORE INSERT ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.compute_attendance_late_minutes_on_insert();

DROP POLICY IF EXISTS "Users can update own attendance checkout only" ON public.attendance;
CREATE POLICY "Users can update own attendance checkout only"
ON public.attendance
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN (
      'attendance-morning-sweep-0830',
      'attendance-morning-sweep-0900',
      'attendance-noon-sweep-1200',
      'auto-submit-missed-leave-daily',
      'auto-submit-missed-leave-every-5min',
      'attendance-missed-leave-sweep-every-5min'
    )
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'attendance-missed-leave-sweep-every-5min',
  '*/5 * * * *',
  $cmd$SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-submit-missed-leave',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' || public._get_cron_secret() || '"}')::jsonb,
    body := '{}'::jsonb
  );$cmd$
);