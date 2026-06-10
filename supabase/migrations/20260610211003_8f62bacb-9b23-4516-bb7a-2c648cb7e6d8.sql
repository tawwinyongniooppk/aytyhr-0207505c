
-- Strengthen guard triggers to also protect auto_approved column on tasks and calendar_event_assignments
CREATE OR REPLACE FUNCTION public.guard_task_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.auto_approved IS DISTINCT FROM OLD.auto_approved
     OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    RAISE EXCEPTION 'Only admin/assistant can change task review fields';
  END IF;
  IF NEW.submission_status IS DISTINCT FROM OLD.submission_status
     AND NEW.submission_status IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Only admin/assistant can approve or reject a task';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_event_assignment_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejected_by IS DISTINCT FROM OLD.rejected_by
     OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.auto_approved IS DISTINCT FROM OLD.auto_approved
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    RAISE EXCEPTION 'Only admin/assistant can change assignment review fields';
  END IF;
  IF NEW.submission_status IS DISTINCT FROM OLD.submission_status
     AND NEW.submission_status IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Only admin/assistant can approve or reject an assignment';
  END IF;
  RETURN NEW;
END;
$function$;

-- Add a guard trigger preventing IT Manager (or any non-self) from modifying sensitive personal contact fields on profiles
CREATE OR REPLACE FUNCTION public.guard_profile_personal_contact_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role / system bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Profile owner can change their own contact fields
  IF auth.uid() = NEW.id THEN
    RETURN NEW;
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.emergency_phone IS DISTINCT FROM OLD.emergency_phone THEN
    RAISE EXCEPTION 'Only the profile owner can change phone or emergency_phone';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_profile_personal_contact_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_personal_contact_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_personal_contact_fields();
