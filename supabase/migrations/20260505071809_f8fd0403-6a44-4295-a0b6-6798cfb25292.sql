-- Allow admin/assistant to delete old logs from tasks, attendance, calendar_events, calendar_event_assignments
CREATE POLICY "Admin/assistant can delete tasks"
ON public.tasks FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')));

CREATE POLICY "Admin/assistant can delete attendance"
ON public.attendance FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')));

-- Add a column to calendar_events to flag "assigned to all staff" so staff can display it
ALTER TABLE public.calendar_events
ADD COLUMN IF NOT EXISTS assigned_to_all boolean NOT NULL DEFAULT false;