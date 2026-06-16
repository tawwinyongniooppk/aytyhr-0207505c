-- Recover Data API access for task-related tables.
-- RLS still controls which rows each signed-in user can see or modify.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_assignments TO authenticated;
GRANT ALL ON public.calendar_event_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_transactions TO authenticated;
GRANT ALL ON public.bonus_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Staff status monitor needs team task status counts, but not financial data.
-- This restores team visibility for task assignment statuses while keeping full task/event editing restricted by existing policies.
DROP POLICY IF EXISTS "Read assignments (own, admin, or team-visible)" ON public.calendar_event_assignments;
DROP POLICY IF EXISTS "Read own assignments or admin/assistant all" ON public.calendar_event_assignments;

CREATE POLICY "Read assignments for task status monitor"
ON public.calendar_event_assignments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin_or_assistant()
  OR EXISTS (
    SELECT 1
    FROM public.calendar_events e
    WHERE e.id = calendar_event_assignments.event_id
      AND e.event_type = 'task'
  )
);