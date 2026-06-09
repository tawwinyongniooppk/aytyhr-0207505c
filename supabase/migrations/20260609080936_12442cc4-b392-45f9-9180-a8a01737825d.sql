
CREATE OR REPLACE FUNCTION public.prevent_duplicate_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE assignee_id = NEW.assignee_id
      AND due_date = NEW.due_date
      AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_TASK: ဤ Staff အတွက် တူညီသော ရက်စွဲတွင် Task တစ်ခု Assign ပြီးသား ရှိနေပါသည်';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_task_assignment ON public.tasks;
CREATE TRIGGER trg_prevent_duplicate_task_assignment
BEFORE INSERT OR UPDATE OF assignee_id, due_date ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_task_assignment();
