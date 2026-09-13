-- 1) Attendance: server-authoritative timestamps (attendance_client_calc)
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
  v_morning_half boolean;
  v_grace constant integer := 5;
BEGIN
  -- Server-authoritative check-in timestamp for non-privileged client writes
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')) THEN
    NEW.check_in_time := now();
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.guard_attendance_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role bypass
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.deduction_applied, false) <> false
       OR COALESCE(NEW.late_minutes, 0) <> 0
       OR COALESCE(NEW.early_minutes, 0) <> 0 THEN
      RAISE EXCEPTION 'Staff cannot set deduction_applied / late_minutes / early_minutes on insert';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.late_minutes IS DISTINCT FROM OLD.late_minutes
     OR NEW.early_minutes IS DISTINCT FROM OLD.early_minutes
     OR NEW.deduction_applied IS DISTINCT FROM OLD.deduction_applied
     OR NEW.check_in_time IS DISTINCT FROM OLD.check_in_time
     OR NEW.check_in_lat IS DISTINCT FROM OLD.check_in_lat
     OR NEW.check_in_lng IS DISTINCT FROM OLD.check_in_lng
     OR NEW.check_in_distance IS DISTINCT FROM OLD.check_in_distance
     OR NEW.location_status IS DISTINCT FROM OLD.location_status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.date IS DISTINCT FROM OLD.date THEN
    RAISE EXCEPTION 'You can only update your own check-out fields';
  END IF;

  -- Server-authoritative check-out timestamp for staff self check-out
  IF NEW.check_out_time IS DISTINCT FROM OLD.check_out_time THEN
    NEW.check_out_time := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Function privilege hardening (SUPA_anon/authenticated_security_definer_function_executable)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_branding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_monthly_attendance(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leave_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leave_balances_all(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_status_monitor(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_rates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_assistant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_it_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_it_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_privileged_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_staff_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_attendance_settings(uuid, date, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_bonus_per_unit(uuid, date) TO authenticated;

-- 3) Realtime channel authorization (realtime_* findings)
CREATE POLICY "Salary and bonus channels scoped to owner or privileged"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() = 'salary-live-' || auth.uid()::text
  OR realtime.topic() = 'yearly-bonus-live-' || auth.uid()::text
  OR (realtime.topic() = 'admin-salaries-live' AND is_admin_or_assistant())
);

CREATE POLICY "Privileged can subscribe to all attendance leave channels"
ON realtime.messages FOR SELECT TO authenticated
USING (realtime.topic() LIKE 'att-leave-%' AND is_admin_or_assistant());

CREATE POLICY "Task monitor channel restricted to privileged"
ON realtime.messages FOR SELECT TO authenticated
USING (realtime.topic() = 'task-status-monitor-live' AND is_admin_or_assistant());

CREATE POLICY "Notifications table channel restricted to managers"
ON realtime.messages FOR SELECT TO authenticated
USING (realtime.topic() = 'notifications-table' AND is_admin_or_it_manager());

-- 4) Profile salary-column lockdown (profiles_salary_fields_it_manager)
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, role, created_at, phone, join_date, check_in_time, check_out_time, work_day, avatar_url, sequence, work_schedule, emergency_phone, class) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_salary_fields()
 RETURNS TABLE(base_salary integer, deduction_rate_per_minute integer, late_deduction_per_minute integer, early_deduction_per_minute integer, partial_leave_deduction_per_minute integer, overtime_rate_per_minute integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_role = 'it_manager' THEN
    RETURN QUERY SELECT NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer, NULL::integer;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.base_salary, p.deduction_rate_per_minute, p.late_deduction_per_minute,
           p.early_deduction_per_minute, p.partial_leave_deduction_per_minute, p.overtime_rate_per_minute
      FROM public.profiles p WHERE p.id = auth.uid();
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_salary_fields() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_full(p_id uuid)
 RETURNS SETOF profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  r public.profiles%ROWTYPE;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF NOT (p_id = auth.uid() OR caller_role IN ('admin','assistant','it_manager')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR r IN SELECT * FROM public.profiles WHERE id = p_id LOOP
    IF caller_role = 'it_manager' OR (p_id <> auth.uid() AND caller_role <> 'admin') THEN
      r.base_salary := NULL;
      r.phone := NULL;
      r.emergency_phone := NULL;
      r.deduction_rate_per_minute := NULL;
      r.late_deduction_per_minute := NULL;
      r.early_deduction_per_minute := NULL;
      r.partial_leave_deduction_per_minute := NULL;
      r.overtime_rate_per_minute := NULL;
      r.bonus_amount := NULL;
    END IF;
    RETURN NEXT r;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_rates(p_user_id uuid)
 RETURNS TABLE(overtime_rate_per_minute integer, partial_leave_deduction_per_minute integer, deduction_rate_per_minute integer, late_deduction_per_minute integer, early_deduction_per_minute integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT p.overtime_rate_per_minute,
           p.partial_leave_deduction_per_minute,
           p.deduction_rate_per_minute,
           p.late_deduction_per_minute,
           p.early_deduction_per_minute
    FROM public.profiles p WHERE p.id = p_user_id;
END
$function$;