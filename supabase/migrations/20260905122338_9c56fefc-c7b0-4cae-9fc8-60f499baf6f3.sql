
CREATE OR REPLACE FUNCTION public.force_leave_request_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE is_privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- service role bypass
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant'))
  INTO is_privileged;
  IF is_privileged THEN RETURN NEW; END IF;
  NEW.status := 'pending';
  NEW.balance_deducted := false;
  NEW.unpaid_salary_deducted := 0;
  NEW.payment_type := 'paid';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_overtime_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE is_privileged boolean; v_rate int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant'))
  INTO is_privileged;
  IF is_privileged THEN RETURN NEW; END IF;
  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.minutes := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NEW.end_at - NEW.start_at)) / 60)::int);
  SELECT overtime_rate_per_minute INTO v_rate FROM public.profiles WHERE id = NEW.user_id;
  NEW.rate_per_minute := COALESCE(v_rate, 200);
  NEW.amount := NEW.minutes * NEW.rate_per_minute;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_force_leave_insert_defaults ON public.leave_requests;
CREATE TRIGGER trg_force_leave_insert_defaults
BEFORE INSERT ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.force_leave_request_insert_defaults();

DROP TRIGGER IF EXISTS trg_force_overtime_insert_defaults ON public.overtime_requests;
CREATE TRIGGER trg_force_overtime_insert_defaults
BEFORE INSERT ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.force_overtime_insert_defaults();
