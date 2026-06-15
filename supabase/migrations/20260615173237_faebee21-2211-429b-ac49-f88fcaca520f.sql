DROP POLICY IF EXISTS "Read own assignments or admin/assistant all" ON public.calendar_event_assignments;

CREATE POLICY "Read assignments (own, admin, or team-visible)"
ON public.calendar_event_assignments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_admin_or_assistant()
  OR EXISTS (
    SELECT 1 FROM public.calendar_events e
    WHERE e.id = calendar_event_assignments.event_id
      AND e.visibility = 'public'
      AND e.event_type = 'task'
  )
);