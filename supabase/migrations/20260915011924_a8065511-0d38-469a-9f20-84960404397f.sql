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
      COUNT(*)::int AS assigned,
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
      COUNT(*)::int AS assigned,
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