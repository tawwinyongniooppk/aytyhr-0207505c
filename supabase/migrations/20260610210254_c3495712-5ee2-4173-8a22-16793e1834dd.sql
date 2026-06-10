CREATE OR REPLACE FUNCTION public.guard_task_assignment_overlap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_start date;
  v_new_end date;
BEGIN
  IF TG_TABLE_NAME = 'tasks' THEN
    IF NEW.assignee_id IS NULL OR NEW.due_date IS NULL THEN
      RETURN NEW;
    END IF;
    v_new_start := COALESCE(NEW.created_at::date, ((now() AT TIME ZONE 'Asia/Yangon'))::date);
    v_new_end := NEW.due_date;

    IF EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.assignee_id = NEW.assignee_id
        AND t.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND t.due_date IS NOT NULL
        AND daterange(COALESCE(t.created_at::date, t.due_date), t.due_date, '[]') && daterange(v_new_start, v_new_end, '[]')
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_TASK: ဤ Staff အတွက် တူညီသော ရက်စွဲ/Deadline တွင် Task တစ်ခု ရှိပြီးသား ဖြစ်ပါသည်';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.calendar_event_assignments cea
      JOIN public.calendar_events ce ON ce.id = cea.event_id
      WHERE cea.user_id = NEW.assignee_id
        AND ce.event_type = 'task'
        AND daterange(ce.start_date, ce.end_date, '[]') && daterange(v_new_start, v_new_end, '[]')
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_TASK: ဤ Staff အတွက် တူညီသော ရက်စွဲ/Deadline တွင် Task တစ်ခု ရှိပြီးသား ဖြစ်ပါသည်';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'calendar_event_assignments' THEN
    SELECT ce.start_date, ce.end_date
      INTO v_new_start, v_new_end
    FROM public.calendar_events ce
    WHERE ce.id = NEW.event_id
      AND ce.event_type = 'task';

    IF v_new_start IS NULL OR v_new_end IS NULL OR NEW.user_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.calendar_event_assignments cea
      JOIN public.calendar_events ce ON ce.id = cea.event_id
      WHERE cea.user_id = NEW.user_id
        AND cea.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND ce.event_type = 'task'
        AND daterange(ce.start_date, ce.end_date, '[]') && daterange(v_new_start, v_new_end, '[]')
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_TASK: ဤ Staff အတွက် တူညီသော ရက်စွဲ/Deadline တွင် Calendar Task တစ်ခု ရှိပြီးသား ဖြစ်ပါသည်';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.assignee_id = NEW.user_id
        AND t.due_date IS NOT NULL
        AND daterange(COALESCE(t.created_at::date, t.due_date), t.due_date, '[]') && daterange(v_new_start, v_new_end, '[]')
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_TASK: ဤ Staff အတွက် တူညီသော ရက်စွဲ/Deadline တွင် Task တစ်ခု ရှိပြီးသား ဖြစ်ပါသည်';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_task_assignment_overlap_on_tasks ON public.tasks;
CREATE TRIGGER trg_guard_task_assignment_overlap_on_tasks
BEFORE INSERT OR UPDATE OF assignee_id, due_date ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.guard_task_assignment_overlap();

DROP TRIGGER IF EXISTS trg_guard_task_assignment_overlap_on_calendar_assignments ON public.calendar_event_assignments;
CREATE TRIGGER trg_guard_task_assignment_overlap_on_calendar_assignments
BEFORE INSERT OR UPDATE OF event_id, user_id ON public.calendar_event_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_task_assignment_overlap();

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'auto-weekly-task-credit';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'auto-weekly-task-credit',
  '25 17 3,10,17,24 * *',
  $$
  SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-weekly-task-credit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);