
-- Allow service-role (auth.uid() IS NULL) to bypass IT-Manager-only field guards.
-- Service-role calls only originate from trusted edge functions (e.g. update-account),
-- which already enforce IT Manager checks before invoking admin updates.

CREATE OR REPLACE FUNCTION public.guard_profile_full_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_it_manager boolean;
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role bypass
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'it_manager'
    ) INTO is_it_manager;
    IF NOT is_it_manager THEN
      RAISE EXCEPTION 'Only IT Manager can change the staff name';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_it_manager boolean;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role bypass
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'it_manager'
    ) INTO is_it_manager;
    IF NOT is_it_manager THEN
      RAISE EXCEPTION 'Only IT Manager can change user role';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_profile_it_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_it_manager boolean;
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.sequence IS DISTINCT FROM OLD.sequence THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role bypass
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'it_manager'
    ) INTO is_it_manager;
    IF NOT is_it_manager THEN
      RAISE EXCEPTION 'Only IT Manager can change profile photo or sequence';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
