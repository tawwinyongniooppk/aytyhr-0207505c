ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

ALTER TABLE public.calendar_event_assignments
  ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_submission_status_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_submission_status_check
  CHECK (submission_status IN ('not_submitted', 'submitted', 'approved'));

ALTER TABLE public.calendar_event_assignments
  DROP CONSTRAINT IF EXISTS calendar_event_assignments_submission_status_check;
ALTER TABLE public.calendar_event_assignments
  ADD CONSTRAINT calendar_event_assignments_submission_status_check
  CHECK (submission_status IN ('not_submitted', 'submitted', 'approved'));

CREATE UNIQUE INDEX IF NOT EXISTS calendar_event_assignments_event_user_unique_idx
  ON public.calendar_event_assignments (event_id, user_id);

DROP POLICY IF EXISTS "Authenticated can read assignments" ON public.calendar_event_assignments;
CREATE POLICY "Users can read relevant assignments"
ON public.calendar_event_assignments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'assistant'::text])
  )
);

DROP POLICY IF EXISTS "Users can update assigned tasks" ON public.tasks;
CREATE POLICY "Users can update assigned tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  assignee_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'assistant'::text])
  )
)
WITH CHECK (
  assignee_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'assistant'::text])
  )
);

CREATE POLICY "Users can update relevant assignments"
ON public.calendar_event_assignments
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'assistant'::text])
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'assistant'::text])
  )
);