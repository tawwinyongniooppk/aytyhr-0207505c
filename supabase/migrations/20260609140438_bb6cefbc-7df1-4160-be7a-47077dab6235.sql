CREATE OR REPLACE FUNCTION public.admin_list_profiles()
 RETURNS SETOF profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin','assistant','it_manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF caller_role = 'it_manager' THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.role, p.created_at, p.base_salary,
             NULL::text AS phone,
             p.join_date, p.check_in_time, p.check_out_time, p.work_day,
             p.avatar_url, p.sequence, p.work_schedule,
             p.deduction_rate_per_minute,
             NULL::text AS emergency_phone,
             p.late_deduction_per_minute, p.early_deduction_per_minute,
             p.partial_leave_deduction_per_minute,
             p.class, p.overtime_rate_per_minute
      FROM public.profiles p
      ORDER BY p.sequence ASC NULLS LAST, p.full_name ASC;
  ELSE
    RETURN QUERY SELECT * FROM public.profiles ORDER BY sequence ASC NULLS LAST, full_name ASC;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_profile_full(p_id uuid)
 RETURNS SETOF profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE caller_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF p_id = auth.uid() THEN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_id;
  ELSIF caller_role IN ('admin','assistant') THEN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_id;
  ELSIF caller_role = 'it_manager' THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.role, p.created_at, p.base_salary,
             NULL::text AS phone,
             p.join_date, p.check_in_time, p.check_out_time, p.work_day,
             p.avatar_url, p.sequence, p.work_schedule,
             p.deduction_rate_per_minute,
             NULL::text AS emergency_phone,
             p.late_deduction_per_minute, p.early_deduction_per_minute,
             p.partial_leave_deduction_per_minute,
             p.class, p.overtime_rate_per_minute
      FROM public.profiles p WHERE p.id = p_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$function$;