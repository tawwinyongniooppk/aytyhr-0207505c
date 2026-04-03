DROP POLICY IF EXISTS "Authenticated can read all tasks" ON public.tasks;
CREATE POLICY "Users can read relevant tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  assignee_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'assistant'::text])
  )
);

DROP POLICY IF EXISTS "Users can read visible events" ON public.calendar_events;
CREATE POLICY "Users can read visible events"
ON public.calendar_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = ANY (ARRAY['admin'::text, 'assistant'::text])
  )
  OR visibility = 'public'
  OR EXISTS (
    SELECT 1
    FROM public.calendar_event_assignments
    WHERE calendar_event_assignments.event_id = calendar_events.id
      AND calendar_event_assignments.user_id = auth.uid()
  )
);