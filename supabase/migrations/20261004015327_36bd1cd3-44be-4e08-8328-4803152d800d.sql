-- Same staff + same task window (exact start_date AND end_date) = max 1 assignment.
CREATE OR REPLACE FUNCTION public.guard_task_same_window_duplicate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start date; v_end date; v_type text;
BEGIN
  SELECT start_date, end_date, event_type INTO v_start, v_end, v_type
    FROM public.calendar_events WHERE id = NEW.event_id;
  IF v_type IS DISTINCT FROM 'task' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('task_window:' || NEW.user_id::text || ':' || v_start::text || ':' || v_end::text));
  IF EXISTS (
    SELECT 1 FROM public.calendar_event_assignments a
    JOIN public.calendar_events e ON e.id = a.event_id
    WHERE a.user_id = NEW.user_id AND a.id <> NEW.id AND a.event_id <> NEW.event_id
      AND e.event_type = 'task' AND e.start_date = v_start AND e.end_date = v_end
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_TASK_WINDOW: staff already has a task for % to %', v_start, v_end;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_task_same_window_duplicate ON public.calendar_event_assignments;
CREATE TRIGGER trg_guard_task_same_window_duplicate
BEFORE INSERT OR UPDATE OF event_id, user_id ON public.calendar_event_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_task_same_window_duplicate();

-- Atomic create: validates all staff first, then inserts event + all assignments in one transaction.
CREATE OR REPLACE FUNCTION public.create_task_with_assignments(
  p_title text, p_description text, p_start date, p_end date, p_assigned_to_all boolean, p_user_ids uuid[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid; v_event uuid; v_errors text[] := '{}'; v_name text; v_count int;
  v_ms date := date_trunc('month', p_start)::date;
  v_nms date := (date_trunc('month', p_start) + interval '1 month')::date;
BEGIN
  IF NOT public.is_admin_or_assistant() THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN RAISE EXCEPTION 'NO_ASSIGNEES'; END IF;
  IF coalesce(trim(p_title), '') = '' THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;

  FOREACH v_uid IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(p_user_ids) x) LOOP
    PERFORM pg_advisory_xact_lock(hashtext('task_window:' || v_uid::text || ':' || p_start::text || ':' || p_end::text));
    SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
    IF EXISTS (SELECT 1 FROM public.calendar_event_assignments a JOIN public.calendar_events e ON e.id = a.event_id
               WHERE a.user_id = v_uid AND e.event_type = 'task' AND e.start_date = p_start AND e.end_date = p_end) THEN
      v_errors := v_errors || (coalesce(v_name, 'Staff') || ' — already has an assignment for ' || p_start || ' → ' || p_end);
      CONTINUE;
    END IF;
    SELECT count(*) INTO v_count FROM public.calendar_event_assignments a JOIN public.calendar_events e ON e.id = a.event_id
      WHERE a.user_id = v_uid AND e.event_type = 'task' AND e.start_date >= v_ms AND e.start_date < v_nms;
    IF v_count + 1 > 4 THEN
      v_errors := v_errors || (coalesce(v_name, 'Staff') || ' — already has ' || v_count || '/4 Units this month');
    END IF;
  END LOOP;

  IF array_length(v_errors, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'TASK_VALIDATION_FAILED|%', array_to_string(v_errors, '||');
  END IF;

  INSERT INTO public.calendar_events (title, description, start_date, end_date, event_type, visibility, created_by, assigned_to_all)
  VALUES (p_title, coalesce(p_description, ''), p_start, p_end, 'task', 'private', auth.uid(), coalesce(p_assigned_to_all, false))
  RETURNING id INTO v_event;

  INSERT INTO public.calendar_event_assignments (event_id, user_id, submission_status)
  SELECT v_event, x, 'not_started' FROM (SELECT DISTINCT unnest(p_user_ids) x) s;

  RETURN v_event;
END $$;

REVOKE ALL ON FUNCTION public.create_task_with_assignments(text, text, date, date, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_with_assignments(text, text, date, date, boolean, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_task_same_window_duplicate() FROM PUBLIC, anon, authenticated;