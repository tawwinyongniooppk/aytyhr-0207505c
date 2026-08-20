-- 1) Late minutes: 5-minute grace, no upper cap
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

  v_expected_min := split_part(v_expected, ':', 1)::integer * 60
                  + split_part(v_expected, ':', 2)::integer;
  v_checkin_min := extract(hour from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::integer * 60
                 + extract(minute from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::integer;
  v_raw_late := GREATEST(0, v_checkin_min - v_expected_min);

  -- Uniform rule for every staff member (existing and future):
  -- grace = 5 minutes, then every further minute is charged. No upper limit.
  NEW.late_minutes := GREATEST(0, v_raw_late - v_grace);

  NEW.early_minutes := 0;
  NEW.deduction_applied := false;
  RETURN NEW;
END;
$function$;

-- 2) Manual leave deduction: allow half days
ALTER TABLE public.leave_manual_deductions
  DROP CONSTRAINT IF EXISTS leave_manual_deductions_days_check;
ALTER TABLE public.leave_manual_deductions
  ALTER COLUMN days TYPE numeric USING days::numeric;
ALTER TABLE public.leave_manual_deductions
  ADD CONSTRAINT leave_manual_deductions_days_check CHECK (days > 0);

-- 3) Geofence: GPS accuracy tolerance + readable message
INSERT INTO public.app_settings (key, value)
VALUES ('geofence_accuracy_tolerance_meters', '75')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_attendance_geofence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  school_lat double precision;
  school_lng double precision;
  allowed_radius double precision;
  tolerance double precision;
  dist double precision;
  earth_r constant double precision := 6371000;
  dlat double precision;
  dlng double precision;
  a double precision;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.check_in_time IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.check_in_lat IS NULL OR NEW.check_in_lng IS NULL THEN
    RAISE EXCEPTION 'Check-in requires location coordinates';
  END IF;

  SELECT value::double precision INTO school_lat     FROM public.app_settings WHERE key = 'school_latitude';
  SELECT value::double precision INTO school_lng     FROM public.app_settings WHERE key = 'school_longitude';
  SELECT value::double precision INTO allowed_radius FROM public.app_settings WHERE key = 'allowed_radius_meters';
  SELECT value::double precision INTO tolerance      FROM public.app_settings WHERE key = 'geofence_accuracy_tolerance_meters';
  tolerance := COALESCE(tolerance, 75);

  IF school_lat IS NULL OR school_lng IS NULL OR allowed_radius IS NULL THEN
    RETURN NEW;
  END IF;

  dlat := radians(NEW.check_in_lat - school_lat);
  dlng := radians(NEW.check_in_lng - school_lng);
  a := sin(dlat/2)^2 + cos(radians(school_lat)) * cos(radians(NEW.check_in_lat)) * sin(dlng/2)^2;
  dist := 2 * earth_r * asin(sqrt(a));

  NEW.check_in_distance := dist;
  IF dist > (allowed_radius + tolerance) THEN
    NEW.location_status := 'outside';
    RAISE EXCEPTION 'You are outside the allowed check-in area (% m away, max % m)',
      round(dist::numeric, 0), round((allowed_radius + tolerance)::numeric, 0);
  ELSIF dist > allowed_radius THEN
    -- inside the GPS-accuracy tolerance band: accept, but flag it
    NEW.location_status := 'inside';
  ELSE
    NEW.location_status := 'inside';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Auto-checkout sweep: exactly one run per day at 15:45 MMT (09:15 UTC)
CREATE OR REPLACE FUNCTION public.refresh_auto_checkout_schedule()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  r record;
  fn_url text := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-checkout';
  cron_secret text;
BEGIN
  cron_secret := public._get_cron_secret();
  IF cron_secret IS NULL OR length(cron_secret) = 0 THEN
    RAISE EXCEPTION 'CRON_SECRET not configured in vault';
  END IF;

  FOR r IN SELECT jobname FROM cron.job
           WHERE jobname LIKE 'attendance-checkout-sweep-%'
              OR jobname = 'auto-checkout-hourly' LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;

  PERFORM cron.schedule(
    'attendance-checkout-sweep-daily',
    '15 9 * * *',
    format(
      'select net.http_post(url:=%L, headers:=(''{"Content-Type":"application/json","Authorization":"Bearer '' || public._get_cron_secret() || ''"}'')::jsonb, body:=%L::jsonb);',
      fn_url,
      '{}'
    )
  );
END;
$function$;
