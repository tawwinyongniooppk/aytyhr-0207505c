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
      1 AS unit_count,
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

CREATE OR REPLACE FUNCTION public.rollup_yearly_bonus_progress(p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start_ts timestamptz := p_month::timestamptz;
  v_end_ts   timestamptz := (p_month + INTERVAL '1 month')::timestamptz;
  v_start    date := p_month;
  v_end      date := (p_month + INTERVAL '1 month')::date;
  m          int := EXTRACT(MONTH FROM p_month)::int;
  y          int := EXTRACT(YEAR  FROM p_month)::int;
  v_cycle    int := CASE WHEN m >= 6 THEN y ELSE y - 1 END;
  v_today    date := ((now() AT TIME ZONE 'Asia/Yangon'))::date;
BEGIN
  WITH task_agg AS (
    SELECT
      assignee_id AS user_id,
      COUNT(*) FILTER (WHERE COALESCE(submission_status,'') <> 'rejected')::int AS assigned,
      COUNT(*) FILTER (
        WHERE submission_status = 'approved'
          AND (due_date IS NULL OR due_date < v_today)
      )::int AS done
    FROM public.tasks
    WHERE assignee_id IS NOT NULL
      AND created_at >= v_start_ts AND created_at < v_end_ts
    GROUP BY assignee_id
  ),
  ev_agg AS (
    SELECT
      a.user_id,
      COALESCE(SUM(
        CASE WHEN COALESCE(a.submission_status,'') <> 'rejected' THEN 1 ELSE 0 END
      ),0)::int AS assigned,
      COALESCE(SUM(
        CASE WHEN a.submission_status = 'approved'
              AND a.approved_at IS NOT NULL
              AND e.end_date < v_today
             THEN 1 ELSE 0 END
      ),0)::int AS done
    FROM public.calendar_event_assignments a
    JOIN public.calendar_events e ON e.id = a.event_id
    WHERE e.event_type = 'task'
      AND e.start_date >= v_start AND e.start_date < v_end
    GROUP BY a.user_id
  ),
  combined AS (
    SELECT
      COALESCE(t.user_id, e.user_id) AS user_id,
      COALESCE(t.assigned,0) + COALESCE(e.assigned,0) AS assigned,
      COALESCE(t.done,0)     + COALESCE(e.done,0)     AS done
    FROM task_agg t FULL OUTER JOIN ev_agg e USING (user_id)
  )
  INSERT INTO public.yearly_bonus_progress (user_id, cycle_start_year, assigned_units, all_done_units)
  SELECT user_id, v_cycle, assigned, done
  FROM combined
  WHERE user_id IS NOT NULL AND (assigned > 0 OR done > 0)
  ON CONFLICT (user_id, cycle_start_year) DO UPDATE
  SET assigned_units = public.yearly_bonus_progress.assigned_units + EXCLUDED.assigned_units,
      all_done_units = public.yearly_bonus_progress.all_done_units + EXCLUDED.all_done_units,
      updated_at     = now();
END $function$;