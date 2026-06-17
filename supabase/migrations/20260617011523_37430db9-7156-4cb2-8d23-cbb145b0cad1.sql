DROP POLICY IF EXISTS "Read own attendance or admin" ON public.attendance;
CREATE POLICY "Read own attendance or admin"
ON public.attendance
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin_or_assistant());

DROP POLICY IF EXISTS "Admin assistant can update any attendance" ON public.attendance;
CREATE POLICY "Admin assistant can update any attendance"
ON public.attendance
FOR UPDATE
TO authenticated
USING (public.is_admin_or_assistant())
WITH CHECK (public.is_admin_or_assistant());

DROP POLICY IF EXISTS "Admin/assistant can delete attendance" ON public.attendance;
CREATE POLICY "Admin/assistant can delete attendance"
ON public.attendance
FOR DELETE
TO authenticated
USING (public.is_admin_or_assistant());