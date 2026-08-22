CREATE OR REPLACE FUNCTION public.guard_task_assignment_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_start date;
  v_new_end date;
  v_is_auto boolean;
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
        AND ce.title NOT LIKE 'Auto Weekly Credit%'
        AND daterange(ce.start_date, ce.end_date, '[]') && daterange(v_new_start, v_new_end, '[]')
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_TASK: ဤ Staff အတွက် တူညီသော ရက်စွဲ/Deadline တွင် Task တစ်ခု ရှိပြီးသား ဖြစ်ပါသည်';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'calendar_event_assignments' THEN
    SELECT ce.start_date, ce.end_date, (ce.title LIKE 'Auto Weekly Credit%')
      INTO v_new_start, v_new_end, v_is_auto
    FROM public.calendar_events ce
    WHERE ce.id = NEW.event_id
      AND ce.event_type = 'task';

    -- System auto-credit rows are never duplicates: they are only inserted for
    -- staff who had NO manual task in the assignment slot.
    IF COALESCE(v_is_auto, false) THEN
      RETURN NEW;
    END IF;

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
        AND ce.title NOT LIKE 'Auto Weekly Credit%'
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
$function$;