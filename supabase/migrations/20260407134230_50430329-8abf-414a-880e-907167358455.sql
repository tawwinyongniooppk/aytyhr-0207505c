-- Change default for tasks.submission_status
ALTER TABLE public.tasks ALTER COLUMN submission_status SET DEFAULT 'not_started';

-- Change default for calendar_event_assignments.submission_status
ALTER TABLE public.calendar_event_assignments ALTER COLUMN submission_status SET DEFAULT 'not_started';