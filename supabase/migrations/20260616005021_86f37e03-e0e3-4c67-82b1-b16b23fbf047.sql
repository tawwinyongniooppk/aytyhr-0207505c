-- Safe aggregate for Staff Status Monitor: exposes counts only, not assignment details.
CREATE OR REPLACE FUNCTION public.get_task_status_monitor(p_month_start date)
RETURNS TABLE (
  user_id uuid,
  new_task integer,
  in_progress integer,
  submitted integer,
  approved integer,
  overdue integer,
  reject integer,
  all_done integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      p_month_start AS month_start,
      (p_month_start + interval '1 month')::date AS next_month_start,
      (now() AT TIME ZONE 'Asia/Yangon')::date AS today
  ), rows AS (
    SELECT
      a.user_id,
      COALESCE(a.submission_status, 'not_started') AS status,
      a.approved_at,
      e.end_date::date AS end_date,
      CASE WHEN (e.end_date::date - e.start_date::date) >= 12 THEN 2 ELSE 1 END AS unit_count,
      b.today
    FROM public.calendar_events e
    JOIN public.calendar_event_assignments a ON a.event_id = e.id
    CROSS JOIN bounds b
    WHERE e.event_type = 'task'
      AND e.start_date::date >= b.month_start
      AND e.start_date::date < b.next_month_start
  )
  SELECT
    r.user_id,
    COALESCE(SUM(CASE WHEN r.status IN ('not_started', 'not_submitted') AND r.end_date >= r.today THEN r.unit_count ELSE 0 END), 0)::integer AS new_task,
    COALESCE(SUM(CASE WHEN r.status = 'in_progress' AND r.end_date >= r.today THEN r.unit_count ELSE 0 END), 0)::integer AS in_progress,
    COALESCE(SUM(CASE WHEN r.status = 'submitted' THEN r.unit_count ELSE 0 END), 0)::integer AS submitted,
    COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.approved_at IS NOT NULL AND r.end_date >= r.today THEN r.unit_count ELSE 0 END), 0)::integer AS approved,
    COALESCE(SUM(CASE WHEN r.status IN ('not_started', 'not_submitted', 'in_progress') AND r.end_date < r.today THEN r.unit_count ELSE 0 END), 0)::integer AS overdue,
    COALESCE(SUM(CASE WHEN r.status = 'rejected' THEN r.unit_count ELSE 0 END), 0)::integer AS reject,
    COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.approved_at IS NOT NULL AND r.end_date < r.today THEN r.unit_count ELSE 0 END), 0)::integer AS all_done
  FROM rows r
  GROUP BY r.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_task_status_monitor(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_task_status_monitor(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_status_monitor(date) TO service_role;

-- Keep detailed assignment rows private again: own rows + admin/assistant only.
DROP POLICY IF EXISTS "Read assignments for task status monitor" ON public.calendar_event_assignments;
DROP POLICY IF EXISTS "Read assignments (own, admin, or team-visible)" ON public.calendar_event_assignments;
DROP POLICY IF EXISTS "Read own assignments or admin/assistant all" ON public.calendar_event_assignments;

CREATE POLICY "Read own assignments or admin assistant all"
ON public.calendar_event_assignments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_admin_or_assistant()
);