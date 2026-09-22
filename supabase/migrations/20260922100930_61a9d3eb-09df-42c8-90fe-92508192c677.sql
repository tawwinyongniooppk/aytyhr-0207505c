CREATE OR REPLACE FUNCTION public.guard_overtime_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE is_privileged boolean;
BEGIN
  -- OT-3B-3-D3: approved and rejected rows are final and immutable for ALL callers,
  -- including Admin/Assistant, SECURITY DEFINER, and service-role callers.
  IF OLD.status IN ('approved','rejected') AND (
       NEW.status           IS DISTINCT FROM OLD.status
    OR NEW.user_id          IS DISTINCT FROM OLD.user_id
    OR NEW.start_at         IS DISTINCT FROM OLD.start_at
    OR NEW.end_at           IS DISTINCT FROM OLD.end_at
    OR NEW.minutes          IS DISTINCT FROM OLD.minutes
    OR NEW.rate_per_minute  IS DISTINCT FROM OLD.rate_per_minute
    OR NEW.amount           IS DISTINCT FROM OLD.amount
    OR NEW.reviewed_by      IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at      IS DISTINCT FROM OLD.reviewed_at
  ) THEN
    IF OLD.status = 'approved' THEN
      RAISE EXCEPTION 'OT_APPROVED_IMMUTABLE';
    ELSE
      RAISE EXCEPTION 'OT_REJECTED_IMMUTABLE';
    END IF;
  END IF;

  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')) INTO is_privileged;
  IF is_privileged THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.minutes IS DISTINCT FROM OLD.minutes
     OR NEW.rate_per_minute IS DISTINCT FROM OLD.rate_per_minute THEN
    RAISE EXCEPTION 'Only admin/assistant can change overtime review or financial fields';
  END IF;
  RETURN NEW;
END $function$;