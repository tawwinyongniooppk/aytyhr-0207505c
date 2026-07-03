DROP POLICY IF EXISTS yearly_bonus_progress_select ON public.yearly_bonus_progress;
CREATE POLICY yearly_bonus_progress_select ON public.yearly_bonus_progress
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin','it_manager','assistant')
  )
);