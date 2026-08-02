CREATE OR REPLACE FUNCTION public.get_task_status_monitor(p_month_start date)
 RETURNS TABLE(user_id uuid, full_name text, sequence integer, new_task integer, in_progress integer, submitted integer, approved integer, overdue integer, reject integer, all_done integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT
      p_month_start AS month_start,
      (p_month_start + interval '1 month')::date AS next_month_start,
      (now() AT TIME ZONE 'Asia/Yangon')::date AS today
  ), assignment_rows AS (
    SELECT
      a.user_id,
      COALESCE(a.submission_status, 'not_started') AS status,
      a.approved_at,
      e.end_date::date AS end_date,
      CASE WHEN (e.end_date::date - e.start_date::date) >= 12 THEN 2 ELSE 1 END AS unit_count,
      EXISTS (
        SELECT 1 FROM public.bonus_transactions bt
        WHERE bt.assignment_id = a.id AND bt.unit_count > 0
      ) AS credited,
      b.today
    FROM public.calendar_events e
    JOIN public.calendar_event_assignments a ON a.event_id = e.id
    CROSS JOIN bounds b
    WHERE e.event_type = 'task'
      AND e.start_date::date >= b.month_start
      AND e.start_date::date < b.next_month_start
  ), flagged AS (
    SELECT r.*, (r.end_date < r.today OR r.credited) AS done_ready
    FROM assignment_rows r
  ), counts AS (
    SELECT
      r.user_id,
      COALESCE(SUM(CASE WHEN r.status IN ('not_started', 'not_submitted') AND r.end_date >= r.today THEN r.unit_count ELSE 0 END), 0)::integer AS new_task,
      COALESCE(SUM(CASE WHEN r.status = 'in_progress' AND r.end_date >= r.today THEN r.unit_count ELSE 0 END), 0)::integer AS in_progress,
      COALESCE(SUM(CASE WHEN r.status = 'submitted' THEN r.unit_count ELSE 0 END), 0)::integer AS submitted,
      COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.approved_at IS NOT NULL AND NOT r.done_ready THEN r.unit_count ELSE 0 END), 0)::integer AS approved,
      COALESCE(SUM(CASE WHEN r.status IN ('not_started', 'not_submitted', 'in_progress') AND r.end_date < r.today THEN r.unit_count ELSE 0 END), 0)::integer AS overdue,
      COALESCE(SUM(CASE WHEN r.status = 'rejected' THEN r.unit_count ELSE 0 END), 0)::integer AS reject,
      COALESCE(SUM(CASE WHEN r.status = 'approved' AND r.approved_at IS NOT NULL AND r.done_ready THEN r.unit_count ELSE 0 END), 0)::integer AS all_done
    FROM flagged r
    GROUP BY r.user_id
  )
  SELECT
    p.id AS user_id,
    p.full_name,
    p.sequence,
    COALESCE(c.new_task, 0) AS new_task,
    COALESCE(c.in_progress, 0) AS in_progress,
    COALESCE(c.submitted, 0) AS submitted,
    COALESCE(c.approved, 0) AS approved,
    COALESCE(c.overdue, 0) AS overdue,
    COALESCE(c.reject, 0) AS reject,
    COALESCE(c.all_done, 0) AS all_done
  FROM public.profiles p
  LEFT JOIN counts c ON c.user_id = p.id
  WHERE p.role = 'staff'
  ORDER BY p.sequence NULLS LAST, p.full_name;
$function$;