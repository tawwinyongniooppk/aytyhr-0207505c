DROP POLICY IF EXISTS "Users can read relevant assignments" ON public.calendar_event_assignments;
CREATE POLICY "Authenticated can read assignments"
ON public.calendar_event_assignments
FOR SELECT
TO authenticated
USING (true);