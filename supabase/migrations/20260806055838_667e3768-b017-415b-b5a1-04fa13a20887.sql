CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
  r public.profiles%ROWTYPE;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin','assistant','it_manager') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR r IN
    SELECT * FROM public.profiles ORDER BY sequence ASC NULLS LAST, full_name ASC
  LOOP
    IF caller_role <> 'admin' THEN
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

CREATE OR REPLACE FUNCTION public.get_profile_full(p_id uuid)
RETURNS SETOF public.profiles
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
    IF p_id <> auth.uid() AND caller_role <> 'admin' THEN
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