
-- Seeds a salaries row for every staff for the given month if missing.
CREATE OR REPLACE FUNCTION public.seed_monthly_salaries(p_month date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH ins AS (
    INSERT INTO public.salaries (user_id, month, base_salary, current_salary, total_deductions, bonus, manual_deduction)
    SELECT p.id, p_month, COALESCE(p.base_salary, 0), COALESCE(p.base_salary, 0), 0, 0, 0
    FROM public.profiles p
    WHERE p.role = 'staff'
      AND NOT EXISTS (
        SELECT 1 FROM public.salaries s WHERE s.user_id = p.id AND s.month = p_month
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_monthly_salaries(date) TO authenticated, service_role;

-- Seed the current Yangon month right now (idempotent).
SELECT public.seed_monthly_salaries(
  date_trunc('month', ((now() AT TIME ZONE 'Asia/Yangon'))::date)::date
);
