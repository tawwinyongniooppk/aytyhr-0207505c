
CREATE TABLE IF NOT EXISTS public.yearly_bonus_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_start_year int NOT NULL,
  assigned_units int NOT NULL DEFAULT 0,
  all_done_units int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cycle_start_year)
);

GRANT SELECT ON public.yearly_bonus_progress TO authenticated;
GRANT ALL ON public.yearly_bonus_progress TO service_role;

ALTER TABLE public.yearly_bonus_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yearly_bonus_progress_select" ON public.yearly_bonus_progress;
CREATE POLICY "yearly_bonus_progress_select"
ON public.yearly_bonus_progress
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','it_manager','assistant_admin')
  )
);

CREATE OR REPLACE FUNCTION public.rollup_yearly_bonus_progress(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        CASE WHEN COALESCE(a.submission_status,'') <> 'rejected'
             THEN CASE WHEN (e.end_date - e.start_date) >= 12 THEN 2 ELSE 1 END
             ELSE 0 END
      ),0)::int AS assigned,
      COALESCE(SUM(
        CASE WHEN a.submission_status = 'approved'
              AND a.approved_at IS NOT NULL
              AND e.end_date < v_today
             THEN CASE WHEN (e.end_date - e.start_date) >= 12 THEN 2 ELSE 1 END
             ELSE 0 END
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
END $$;

CREATE OR REPLACE FUNCTION public.reset_yearly_bonus_progress(p_cycle_start_year int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.yearly_bonus_progress WHERE cycle_start_year = p_cycle_start_year;
END $$;

CREATE OR REPLACE FUNCTION public.monthly_reset_for(p_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := p_month::timestamptz;
  v_end   timestamptz := (p_month + INTERVAL '1 month')::timestamptz;
  v_start_date date := p_month;
  v_end_date   date := (p_month + INTERVAL '1 month')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM public.rollup_yearly_bonus_progress(p_month);

  DELETE FROM public.salaries WHERE month = p_month;
  -- KEEP: leave_manual_deductions & salary_manual_deductions (yearly, not monthly)
  DELETE FROM public.salary_manual_additions WHERE month = p_month;
  DELETE FROM public.attendance          WHERE date     >= v_start_date AND date     < v_end_date;
  DELETE FROM public.leave_requests      WHERE date     >= v_start_date AND date     < v_end_date;
  DELETE FROM public.overtime_requests   WHERE start_at >= v_start      AND start_at < v_end;
  DELETE FROM public.calendar_event_assignments
    WHERE event_id IN (
      SELECT id FROM public.calendar_events
      WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date
    );
  DELETE FROM public.calendar_events
    WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date;
  DELETE FROM public.tasks WHERE created_at >= v_start AND created_at < v_end;
END $$;

-- Backfill June 2026 from bonus_transactions
INSERT INTO public.yearly_bonus_progress (user_id, cycle_start_year, assigned_units, all_done_units)
SELECT
  user_id,
  2026,
  COALESCE(SUM(unit_count), 0)::int,
  COALESCE(SUM(unit_count), 0)::int
FROM public.bonus_transactions
WHERE month = DATE '2026-06-01'
GROUP BY user_id
ON CONFLICT (user_id, cycle_start_year) DO UPDATE
SET assigned_units = GREATEST(public.yearly_bonus_progress.assigned_units, EXCLUDED.assigned_units),
    all_done_units = GREATEST(public.yearly_bonus_progress.all_done_units, EXCLUDED.all_done_units),
    updated_at     = now();
