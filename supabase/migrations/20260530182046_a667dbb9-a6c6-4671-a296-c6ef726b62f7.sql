-- Extend the base_salary guard to also block changes to per-minute deduction rates
-- by non-admin users. Only admin may modify financial rate columns on profiles.
CREATE OR REPLACE FUNCTION public.guard_profile_base_salary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF TG_OP = 'UPDATE' AND (
       NEW.base_salary IS DISTINCT FROM OLD.base_salary
    OR NEW.deduction_rate_per_minute IS DISTINCT FROM OLD.deduction_rate_per_minute
    OR NEW.late_deduction_per_minute IS DISTINCT FROM OLD.late_deduction_per_minute
    OR NEW.early_deduction_per_minute IS DISTINCT FROM OLD.early_deduction_per_minute
    OR NEW.partial_leave_deduction_per_minute IS DISTINCT FROM OLD.partial_leave_deduction_per_minute
  ) THEN
    RAISE EXCEPTION 'Only admin can change financial fields (base_salary or per-minute deduction rates)';
  END IF;
  RETURN NEW;
END;
$function$;

-- Attach the trigger (idempotent)
DROP TRIGGER IF EXISTS trg_guard_profile_base_salary ON public.profiles;
CREATE TRIGGER trg_guard_profile_base_salary
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_base_salary();