ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS internal_name text;

CREATE OR REPLACE FUNCTION public.guard_profile_it_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_it_manager boolean;
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.sequence IS DISTINCT FROM OLD.sequence
     OR NEW.class IS DISTINCT FROM OLD.class
     OR NEW.internal_name IS DISTINCT FROM OLD.internal_name THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role bypass
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'it_manager'
    ) INTO is_it_manager;
    IF NOT is_it_manager THEN
      RAISE EXCEPTION 'Only IT Manager can change profile photo, sequence, class, or internal name';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_self_edit_allowlist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;
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
     OR NEW.internal_name                   IS DISTINCT FROM OLD.internal_name
  THEN
    RAISE EXCEPTION 'Staff can only change their own avatar, phone, and emergency phone';
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Authenticated can read operational settings" ON public.app_settings;
CREATE POLICY "Authenticated can read operational settings" ON public.app_settings
FOR SELECT TO authenticated
USING (key = ANY (ARRAY['company_logo_url','company_name','start_time','end_time','grace_period_minutes','school_latitude','school_longitude','allowed_radius_meters','deduction_rate_per_minute','slip_signing_enabled','slip_signing_enabled_until','school_phone','school_address']));