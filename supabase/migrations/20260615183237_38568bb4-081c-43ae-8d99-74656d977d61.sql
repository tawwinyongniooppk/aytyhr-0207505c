-- Restore Data API GRANTs that were lost. Without these, PostgREST returns
-- permission denied even when RLS would allow the row, which broke the Task
-- Scheduler ("Failed to load events") and all task create/update flows for
-- Admin and Assistant Admin.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_assignments TO authenticated;
GRANT ALL ON public.calendar_event_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;