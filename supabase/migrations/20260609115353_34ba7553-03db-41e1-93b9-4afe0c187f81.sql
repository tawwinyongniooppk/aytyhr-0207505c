
-- 1) Restrict salary_manual_deductions INSERT to admin only
DROP POLICY IF EXISTS "Admin insert smd" ON public.salary_manual_deductions;
CREATE POLICY "Admin insert smd" ON public.salary_manual_deductions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2) Update guard_profile_base_salary to also block overtime_rate_per_minute and attach as trigger
CREATE OR REPLACE FUNCTION public.guard_profile_base_salary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') INTO is_admin;
  IF is_admin THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.base_salary IS DISTINCT FROM OLD.base_salary
    OR NEW.deduction_rate_per_minute IS DISTINCT FROM OLD.deduction_rate_per_minute
    OR NEW.late_deduction_per_minute IS DISTINCT FROM OLD.late_deduction_per_minute
    OR NEW.early_deduction_per_minute IS DISTINCT FROM OLD.early_deduction_per_minute
    OR NEW.partial_leave_deduction_per_minute IS DISTINCT FROM OLD.partial_leave_deduction_per_minute
    OR NEW.overtime_rate_per_minute IS DISTINCT FROM OLD.overtime_rate_per_minute
  ) THEN
    RAISE EXCEPTION 'Only admin can change financial fields on profiles';
  END IF;
  RETURN NEW;
END;
$$;

-- Attach all existing guard triggers (none were attached before)
DROP TRIGGER IF EXISTS trg_guard_profile_base_salary ON public.profiles;
CREATE TRIGGER trg_guard_profile_base_salary BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_base_salary();

DROP TRIGGER IF EXISTS trg_guard_profile_role_change ON public.profiles;
CREATE TRIGGER trg_guard_profile_role_change BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();

DROP TRIGGER IF EXISTS trg_guard_profile_full_name_change ON public.profiles;
CREATE TRIGGER trg_guard_profile_full_name_change BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_full_name_change();

DROP TRIGGER IF EXISTS trg_guard_profile_it_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_it_fields BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_it_fields();

-- 3) Restrict IT manager from reading phone/emergency_phone on profiles.
-- Split SELECT policy: admin/assistant keep full row read; it_manager loses direct row read
-- and must use admin_list_profiles RPC (which we redact below).
DROP POLICY IF EXISTS "Users read own profile or privileged read all" ON public.profiles;
CREATE POLICY "Users read own or admin/assistant read all" ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant'))
);

-- Redact sensitive contact fields when caller is it_manager
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin','assistant','it_manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF caller_role = 'it_manager' THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.role, p.base_salary,
             NULL::text AS phone,
             p.join_date, p.check_in_time, p.check_out_time, p.work_day,
             p.created_at, p.updated_at, p.deduction_rate_per_minute,
             p.late_deduction_per_minute, p.early_deduction_per_minute,
             p.partial_leave_deduction_per_minute,
             NULL::text AS emergency_phone,
             p.avatar_url, p.sequence, p.class, p.work_schedule,
             p.overtime_rate_per_minute
      FROM public.profiles p
      ORDER BY p.sequence ASC, p.full_name ASC;
  ELSE
    RETURN QUERY SELECT * FROM public.profiles ORDER BY sequence ASC, full_name ASC;
  END IF;
END;
$$;

-- Also redact get_profile_full for it_manager viewing other profiles
CREATE OR REPLACE FUNCTION public.get_profile_full(p_id uuid)
RETURNS SETOF public.profiles
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF p_id = auth.uid() THEN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_id;
  ELSIF caller_role IN ('admin','assistant') THEN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_id;
  ELSIF caller_role = 'it_manager' THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.role, p.base_salary,
             NULL::text AS phone,
             p.join_date, p.check_in_time, p.check_out_time, p.work_day,
             p.created_at, p.updated_at, p.deduction_rate_per_minute,
             p.late_deduction_per_minute, p.early_deduction_per_minute,
             p.partial_leave_deduction_per_minute,
             NULL::text AS emergency_phone,
             p.avatar_url, p.sequence, p.class, p.work_schedule,
             p.overtime_rate_per_minute
      FROM public.profiles p WHERE p.id = p_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;
