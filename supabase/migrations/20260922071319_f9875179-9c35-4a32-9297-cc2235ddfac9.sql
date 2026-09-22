-- OT-3A: Assistant Admin must be able to trigger the automatic overtime
-- salary addition through the existing approval flow, without gaining
-- arbitrary manual financial entry or financial visibility.
-- Scope: kind = 'auto' rows only (the automatic OT payment flow).

CREATE POLICY "Assistant can insert auto salary additions"
ON public.salary_manual_additions
FOR INSERT
TO authenticated
WITH CHECK (
  kind = 'auto'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'assistant'
  )
);

CREATE POLICY "Assistant can read auto salary additions"
ON public.salary_manual_additions
FOR SELECT
TO authenticated
USING (
  kind = 'auto'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'assistant'
  )
);