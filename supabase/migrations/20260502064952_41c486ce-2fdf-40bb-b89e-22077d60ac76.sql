ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.calendar_event_assignments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_event_assignments;