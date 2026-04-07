-- Drop old check constraints
ALTER TABLE public.tasks DROP CONSTRAINT tasks_submission_status_check;
ALTER TABLE public.calendar_event_assignments DROP CONSTRAINT calendar_event_assignments_submission_status_check;

-- Add new check constraints with updated values
ALTER TABLE public.tasks ADD CONSTRAINT tasks_submission_status_check 
  CHECK (submission_status = ANY (ARRAY['not_started'::text, 'not_submitted'::text, 'in_progress'::text, 'submitted'::text, 'approved'::text]));

ALTER TABLE public.calendar_event_assignments ADD CONSTRAINT calendar_event_assignments_submission_status_check 
  CHECK (submission_status = ANY (ARRAY['not_started'::text, 'not_submitted'::text, 'in_progress'::text, 'submitted'::text, 'approved'::text]));