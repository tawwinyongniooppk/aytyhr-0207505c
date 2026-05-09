-- 1. Restrict staff attendance updates to safe fields only
DROP POLICY IF EXISTS "Users can update own attendance" ON public.attendance;

CREATE POLICY "Admin assistant can update any attendance"
ON public.attendance
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')));

CREATE POLICY "Users can update own attendance"
ON public.attendance
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_attendance_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role bypass
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.late_minutes IS DISTINCT FROM OLD.late_minutes
     OR NEW.early_minutes IS DISTINCT FROM OLD.early_minutes
     OR NEW.deduction_applied IS DISTINCT FROM OLD.deduction_applied
     OR NEW.check_in_time IS DISTINCT FROM OLD.check_in_time
     OR NEW.check_in_lat IS DISTINCT FROM OLD.check_in_lat
     OR NEW.check_in_lng IS DISTINCT FROM OLD.check_in_lng
     OR NEW.check_in_distance IS DISTINCT FROM OLD.check_in_distance
     OR NEW.location_status IS DISTINCT FROM OLD.location_status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.date IS DISTINCT FROM OLD.date THEN
    RAISE EXCEPTION 'You can only update your own check-out fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_attendance_protected_fields_trg ON public.attendance;
CREATE TRIGGER guard_attendance_protected_fields_trg
BEFORE UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_protected_fields();

-- 2. Remove self-insert on profiles (closed system; only edge functions / trigger create profiles)
DROP POLICY IF EXISTS "Insert own staff profile only" ON public.profiles;

-- 3. Remove broad public-listing policies on storage.objects
-- Public file URLs continue to work via the storage public endpoint without these policies.
DROP POLICY IF EXISTS "Avatars publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Branding public read" ON storage.objects;