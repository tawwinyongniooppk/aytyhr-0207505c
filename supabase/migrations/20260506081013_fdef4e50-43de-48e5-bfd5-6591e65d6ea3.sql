CREATE OR REPLACE FUNCTION public.guard_salary_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
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

  -- UPDATE
  IF NEW.bonus IS DISTINCT FROM OLD.bonus
     OR NEW.manual_deduction IS DISTINCT FROM OLD.manual_deduction
     OR NEW.deduction_reason IS DISTINCT FROM OLD.deduction_reason
     OR NEW.base_salary IS DISTINCT FROM OLD.base_salary THEN
    RAISE EXCEPTION 'Only admin can change financial fields (bonus, manual_deduction, deduction_reason, base_salary)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_salary_financial_fields_trg ON public.salaries;
CREATE TRIGGER guard_salary_financial_fields_trg
BEFORE INSERT OR UPDATE ON public.salaries
FOR EACH ROW EXECUTE FUNCTION public.guard_salary_financial_fields();

-- Also guard base_salary on profiles: only admin can change it.
CREATE OR REPLACE FUNCTION public.guard_profile_base_salary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.base_salary IS DISTINCT FROM OLD.base_salary THEN
    RAISE EXCEPTION 'Only admin can change base_salary';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_base_salary_trg ON public.profiles;
CREATE TRIGGER guard_profile_base_salary_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_base_salary();