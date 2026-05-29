
-- Add class column to profiles (informational label, not a permission role)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS class text NOT NULL DEFAULT 'Neutral';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_class_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_class_check
  CHECK (class IN ('Beginner','Junior','Senior','Neutral'));

-- Extend the existing IT-Manager-only guard to also cover the class column
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
     OR NEW.sequence IS DISTINCT FROM OLD.sequence
     OR NEW.class IS DISTINCT FROM OLD.class THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role bypass
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'it_manager'
    ) INTO is_it_manager;
    IF NOT is_it_manager THEN
      RAISE EXCEPTION 'Only IT Manager can change profile photo, sequence, or class';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
