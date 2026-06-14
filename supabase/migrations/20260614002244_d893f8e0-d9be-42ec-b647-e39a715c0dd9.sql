DROP POLICY IF EXISTS "Read own OT or privileged" ON public.overtime_requests;
CREATE POLICY "Read own OT or privileged"
ON public.overtime_requests
FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = ANY (ARRAY['admin'::text, 'assistant'::text])
  )
);