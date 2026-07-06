
-- 1. Allow Assistant Admin to insert/delete Manual Leave Deductions (was admin-only)
DROP POLICY IF EXISTS "Admin can insert manual deductions" ON public.leave_manual_deductions;
DROP POLICY IF EXISTS "Admin can delete manual deductions" ON public.leave_manual_deductions;

CREATE POLICY "Admin or assistant can insert manual deductions"
ON public.leave_manual_deductions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND role IN ('admin','assistant')
));

CREATE POLICY "Admin or assistant can delete manual deductions"
ON public.leave_manual_deductions
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND role IN ('admin','assistant')
));

-- 2. Cap check-in late deductions at the 30-minute grace boundary and
--    auto-submit a Morning Half-Leave when a staff checks in later than that.
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
  v_expected_min int;
  v_checkin_min int;
  v_grace int;
  v_raw_late int;
  v_has_paid_excuse boolean;
  v_day jsonb;
  v_has_morning_half boolean;
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

  SELECT COALESCE(NULLIF(value, '')::int, 30)
    INTO v_grace
  FROM public.app_settings
  WHERE key = 'grace_period_minutes';
  -- Hard-cap: late-per-minute deductions ONLY inside the 30-minute grace.
  v_grace := LEAST(COALESCE(v_grace, 30), 30);

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

  v_expected_min := split_part(v_expected, ':', 1)::int * 60 + split_part(v_expected, ':', 2)::int;
  v_checkin_min := extract(hour from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::int * 60
                 + extract(minute from (NEW.check_in_time AT TIME ZONE 'Asia/Yangon'))::int;
  v_raw_late := GREATEST(0, v_checkin_min - v_expected_min);

  IF v_has_paid_excuse THEN
    NEW.late_minutes := 0;
  ELSIF v_raw_late > v_grace THEN
    -- Beyond the 30-min grace: auto-submit a Morning Half-Leave (if not present)
    -- and waive the per-minute late deduction. Admin can still add a manual
    -- deduction on the half-leave itself.
    SELECT EXISTS (
      SELECT 1 FROM public.leave_requests
      WHERE user_id = NEW.user_id AND date = NEW.date
        AND type = 'half_leave' AND half_period = 'morning'
        AND status <> 'rejected'
    ) INTO v_has_morning_half;

    IF NOT v_has_morning_half THEN
      BEGIN
        INSERT INTO public.leave_requests (user_id, date, type, half_period, status, payment_type, reason)
        VALUES (NEW.user_id, NEW.date, 'half_leave', 'morning', 'pending', 'unpaid',
                '[AUTO] Late check-in (+30min) — auto Half-Leave');
      EXCEPTION WHEN OTHERS THEN
        -- Never block check-in on auto-submission failure
        NULL;
      END;
    END IF;
    NEW.late_minutes := 0;
  ELSE
    -- Within grace: charge per-minute up to the raw late (capped by grace anyway)
    NEW.late_minutes := LEAST(v_raw_late, v_grace);
  END IF;

  NEW.early_minutes := 0;
  NEW.deduction_applied := false;
  RETURN NEW;
END;
$function$;
