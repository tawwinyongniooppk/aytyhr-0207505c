DROP POLICY "Admin/assistant can insert tasks" ON public.tasks;
DROP POLICY "Authenticated can update tasks" ON public.tasks;

CREATE POLICY "Admin/assistant can insert tasks" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'assistant'))
);

CREATE POLICY "Users can update assigned tasks" ON public.tasks FOR UPDATE TO authenticated
USING (assignee_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'assistant')));