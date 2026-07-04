
-- Allow-list guard: prevents a non-privileged user from changing any profile
-- column other than the explicitly allowed self-editable ones. Any newly
-- added column is locked by default (defense-in-depth vs. the existing
-- deny-list checks in the UPDATE policy WITH CHECK).
CREATE OR REPLACE FUNCTION public.guard_profile_self_edit_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  -- Service role / system bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only enforce for self-edits by non-privileged users. Admin / assistant /
  -- IT manager writes are still governed by the existing column-specific
  -- guard triggers (role/full_name/financial/IT fields).
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF auth.uid() <> NEW.id THEN
    -- Non-privileged, non-owner edits are already blocked by RLS; nothing to do
    RETURN NEW;
  END IF;

  -- Explicit allow-list of self-editable columns.
  -- Everything not listed here MUST match OLD (locked by default).
  IF NEW.id                                 IS DISTINCT FROM OLD.id
     OR NEW.full_name                       IS DISTINCT FROM OLD.full_name
     OR NEW.role                            IS DISTINCT FROM OLD.role
     OR NEW.created_at                      IS DISTINCT FROM OLD.created_at
     OR NEW.base_salary                     IS DISTINCT FROM OLD.base_salary
     OR NEW.join_date                       IS DISTINCT FROM OLD.join_date
     OR NEW.check_in_time                   IS DISTINCT FROM OLD.check_in_time
     OR NEW.check_out_time                  IS DISTINCT FROM OLD.check_out_time
     OR NEW.work_day                        IS DISTINCT FROM OLD.work_day
     OR NEW.sequence                        IS DISTINCT FROM OLD.sequence
     OR NEW.work_schedule                   IS DISTINCT FROM OLD.work_schedule
     OR NEW.deduction_rate_per_minute       IS DISTINCT FROM OLD.deduction_rate_per_minute
     OR NEW.late_deduction_per_minute       IS DISTINCT FROM OLD.late_deduction_per_minute
     OR NEW.early_deduction_per_minute      IS DISTINCT FROM OLD.early_deduction_per_minute
     OR NEW.partial_leave_deduction_per_minute IS DISTINCT FROM OLD.partial_leave_deduction_per_minute
     OR NEW.overtime_rate_per_minute        IS DISTINCT FROM OLD.overtime_rate_per_minute
     OR NEW.class                           IS DISTINCT FROM OLD.class
  THEN
    RAISE EXCEPTION 'Staff can only change their own avatar, phone, and emergency phone';
  END IF;

  -- Allowed to change: avatar_url, phone, emergency_phone
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_self_edit_allowlist ON public.profiles;
CREATE TRIGGER trg_guard_profile_self_edit_allowlist
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_edit_allowlist();
