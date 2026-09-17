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
  -- C-6: block acknowledge (New -> In Progress) once the deadline date has passed (Asia/Yangon, date-only).
  IF NEW.submission_status IS DISTINCT FROM OLD.submission_status
     AND NEW.submission_status = 'in_progress'
     AND OLD.submission_status IN ('not_started','not_submitted','overdue')
     AND NEW.due_date IS NOT NULL
     AND NEW.due_date < (now() AT TIME ZONE 'Asia/Yangon')::date THEN
    RAISE EXCEPTION 'DEADLINE_PASSED: Deadline exceeded; this task can no longer be acknowledged';
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
  v_end_date date;
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
  -- C-6: block acknowledge (New -> In Progress) once the deadline date has passed (Asia/Yangon, date-only).
  IF NEW.submission_status IS DISTINCT FROM OLD.submission_status
     AND NEW.submission_status = 'in_progress'
     AND OLD.submission_status IN ('not_started','not_submitted','overdue') THEN
    SELECT ce.end_date INTO v_end_date
      FROM public.calendar_events ce
      WHERE ce.id = NEW.event_id;
    IF v_end_date IS NOT NULL
       AND v_end_date < (now() AT TIME ZONE 'Asia/Yangon')::date THEN
      RAISE EXCEPTION 'DEADLINE_PASSED: Deadline exceeded; this task can no longer be acknowledged';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;