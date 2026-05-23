
-- 1. Guard leave_requests financial markers
CREATE OR REPLACE FUNCTION public.guard_leave_request_protected_fields()
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
  IF NEW.unpaid_salary_deducted IS DISTINCT FROM OLD.unpaid_salary_deducted
     OR NEW.balance_deducted IS DISTINCT FROM OLD.balance_deducted
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.payment_type IS DISTINCT FROM OLD.payment_type
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'Only admin/assistant can change leave-request review or financial fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_leave_request_protected_fields_trg ON public.leave_requests;
CREATE TRIGGER guard_leave_request_protected_fields_trg
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_leave_request_protected_fields();

-- 2. Guard calendar_event_assignments review fields
CREATE OR REPLACE FUNCTION public.guard_event_assignment_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    RAISE EXCEPTION 'Only admin/assistant can change assignment review fields';
  END IF;
  IF NEW.submission_status IS DISTINCT FROM OLD.submission_status
     AND NEW.submission_status = 'approved' THEN
    RAISE EXCEPTION 'Only admin/assistant can approve an assignment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_event_assignment_protected_fields_trg ON public.calendar_event_assignments;
CREATE TRIGGER guard_event_assignment_protected_fields_trg
BEFORE UPDATE ON public.calendar_event_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_event_assignment_protected_fields();

-- 3. Guard tasks review fields
CREATE OR REPLACE FUNCTION public.guard_task_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
     OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    RAISE EXCEPTION 'Only admin/assistant can change task review fields';
  END IF;
  IF NEW.submission_status IS DISTINCT FROM OLD.submission_status
     AND NEW.submission_status = 'approved' THEN
    RAISE EXCEPTION 'Only admin/assistant can approve a task';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_task_protected_fields_trg ON public.tasks;
CREATE TRIGGER guard_task_protected_fields_trg
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_task_protected_fields();

-- 4. Restrict salaries SELECT: assistants can no longer read financial data.
-- Only the row owner and admins can read salary rows. Assistants needing
-- non-financial summaries should go through a dedicated definer function.
DROP POLICY IF EXISTS "Read own salary or admin" ON public.salaries;
CREATE POLICY "Read own salary or admin"
ON public.salaries
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);
