-- Lock down SECURITY DEFINER RPCs from being called by clients

-- 1. compute_bonus_per_unit: add caller authz + restrict to service_role
CREATE OR REPLACE FUNCTION public.compute_bonus_per_unit(p_user_id uuid, p_month date)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = auth.uid() AND role IN ('admin','it_manager')
     ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN COALESCE((SELECT bonus FROM public.salaries WHERE user_id = p_user_id AND month = p_month), 0) / 4;
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_bonus_per_unit(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_bonus_per_unit(uuid, date) TO service_role;

-- 2. monthly_reset_for: add role check + restrict to service_role
CREATE OR REPLACE FUNCTION public.monthly_reset_for(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.bonus_transactions WHERE month = p_month;
  DELETE FROM public.salaries WHERE month = p_month;
  DELETE FROM public.leave_manual_deductions
    WHERE created_at >= p_month::timestamptz
      AND created_at < (p_month + INTERVAL '1 month')::timestamptz;
END;
$function$;

REVOKE ALL ON FUNCTION public.monthly_reset_for(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_reset_for(date) TO service_role;