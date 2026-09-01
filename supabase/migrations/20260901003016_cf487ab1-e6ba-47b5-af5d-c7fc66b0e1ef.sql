CREATE OR REPLACE FUNCTION public.guard_salary_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Server-side automation (cron / service role / migrations) has no auth.uid();
  -- it must be able to seed monthly salary rows.
  IF auth.uid() IS NULL AND current_user IN ('service_role','postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.bonus,0) <> 0
       OR COALESCE(NEW.manual_deduction,0) <> 0
       OR COALESCE(NEW.deduction_reason,'') <> '' THEN
      RAISE EXCEPTION 'Only admin can set bonus, manual_deduction, or deduction_reason';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.bonus IS DISTINCT FROM OLD.bonus
     OR NEW.manual_deduction IS DISTINCT FROM OLD.manual_deduction
     OR NEW.deduction_reason IS DISTINCT FROM OLD.deduction_reason
     OR NEW.base_salary IS DISTINCT FROM OLD.base_salary THEN
    RAISE EXCEPTION 'Only admin can change financial fields (bonus, manual_deduction, deduction_reason, base_salary)';
  END IF;
  RETURN NEW;
END;
$$;