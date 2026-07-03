
DROP POLICY IF EXISTS "Read own salary or admin or assistant" ON public.salaries;
CREATE POLICY "Read own salary or admin or it manager"
  ON public.salaries FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','it_manager'))
  );

DROP POLICY IF EXISTS "Read own or admin/assistant" ON public.bonus_transactions;
CREATE POLICY "Read own or admin/it_manager"
  ON public.bonus_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','it_manager'))
  );

DROP POLICY IF EXISTS "Read own or admin/assistant" ON public.salary_manual_additions;
CREATE POLICY "Read own or admin/it_manager sma"
  ON public.salary_manual_additions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','it_manager'))
  );

DROP POLICY IF EXISTS "Read own or admin/assistant" ON public.salary_manual_deductions;
CREATE POLICY "Read own or admin/it_manager smd"
  ON public.salary_manual_deductions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','it_manager'))
  );

CREATE OR REPLACE FUNCTION public.is_admin_or_it_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','it_manager'));
$$;

DROP POLICY IF EXISTS "Users read own or admin/assistant read all" ON public.profiles;
CREATE POLICY "Users read own or admin/it_manager read all"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin_or_it_manager());

CREATE OR REPLACE FUNCTION public.list_staff_directory()
RETURNS TABLE (
  id uuid,
  full_name text,
  role text,
  sequence integer,
  class text,
  work_schedule jsonb,
  work_day text,
  check_in_time text,
  check_out_time text,
  avatar_url text,
  join_date date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.role, p.sequence, p.class, p.work_schedule,
         p.work_day, p.check_in_time, p.check_out_time, p.avatar_url, p.join_date
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
  ORDER BY p.sequence NULLS LAST, p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_staff_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_rates(p_user_id uuid)
RETURNS TABLE (
  overtime_rate_per_minute integer,
  partial_leave_deduction_per_minute integer,
  deduction_rate_per_minute integer,
  late_deduction_per_minute integer,
  early_deduction_per_minute integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')
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
END $$;

GRANT EXECUTE ON FUNCTION public.get_user_rates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_profiles()
 RETURNS SETOF public.profiles
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin','assistant','it_manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF caller_role = 'admin' THEN
    RETURN QUERY SELECT * FROM public.profiles ORDER BY sequence ASC NULLS LAST, full_name ASC;
  ELSE
    RETURN QUERY
      SELECT p.id, p.full_name, p.role, p.created_at,
             NULL::integer AS base_salary,
             NULL::text AS phone,
             p.join_date, p.check_in_time, p.check_out_time, p.work_day,
             p.avatar_url, p.sequence, p.work_schedule,
             NULL::integer AS deduction_rate_per_minute,
             NULL::text AS emergency_phone,
             NULL::integer AS late_deduction_per_minute,
             NULL::integer AS early_deduction_per_minute,
             NULL::integer AS partial_leave_deduction_per_minute,
             p.class,
             NULL::integer AS overtime_rate_per_minute
      FROM public.profiles p
      ORDER BY p.sequence ASC NULLS LAST, p.full_name ASC;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_profile_full(p_id uuid)
 RETURNS SETOF public.profiles
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF p_id = auth.uid() THEN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_id;
  ELSIF caller_role = 'admin' THEN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_id;
  ELSIF caller_role IN ('assistant','it_manager') THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.role, p.created_at,
             NULL::integer AS base_salary,
             NULL::text AS phone,
             p.join_date, p.check_in_time, p.check_out_time, p.work_day,
             p.avatar_url, p.sequence, p.work_schedule,
             NULL::integer AS deduction_rate_per_minute,
             NULL::text AS emergency_phone,
             NULL::integer AS late_deduction_per_minute,
             NULL::integer AS early_deduction_per_minute,
             NULL::integer AS partial_leave_deduction_per_minute,
             p.class,
             NULL::integer AS overtime_rate_per_minute
      FROM public.profiles p WHERE p.id = p_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$function$;
