-- 1. Per-staff overtime rate
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS overtime_rate_per_minute integer NOT NULL DEFAULT 200;

-- 2. Distinguish auto (overtime) additions from manual additions
ALTER TABLE public.salary_manual_additions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual';

-- Allow service-role / triggers / approvals to insert 'auto' additions even when not admin.
-- Policies already restrict insert to admin, plus we will add a new policy permitting
-- system-issued OT additions tied to the requester themselves.

-- 3. Overtime requests table
CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  minutes integer NOT NULL DEFAULT 0,
  rate_per_minute integer NOT NULL DEFAULT 0,
  amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.overtime_requests TO authenticated;
GRANT ALL ON public.overtime_requests TO service_role;

ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own OT or privileged"
ON public.overtime_requests FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant','it_manager'))
);

CREATE POLICY "Users insert own OT"
ON public.overtime_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own pending OT"
ON public.overtime_requests FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status = 'pending' AND reviewed_by IS NULL);

CREATE POLICY "Admin/assistant update any OT"
ON public.overtime_requests FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')));

CREATE POLICY "Admin/assistant delete OT"
ON public.overtime_requests FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')));

-- 4. Guard: staff cannot self-approve their own OT
CREATE OR REPLACE FUNCTION public.guard_overtime_protected_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_privileged boolean;
BEGIN
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
END $$;

DROP TRIGGER IF EXISTS trg_guard_overtime ON public.overtime_requests;
CREATE TRIGGER trg_guard_overtime
BEFORE UPDATE ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_overtime_protected_fields();

-- 5. Update monthly_reset_for to also wipe overtime_requests
CREATE OR REPLACE FUNCTION public.monthly_reset_for(p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := p_month::timestamptz;
  v_end   timestamptz := (p_month + INTERVAL '1 month')::timestamptz;
  v_start_date date := p_month;
  v_end_date date := (p_month + INTERVAL '1 month')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','it_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.bonus_transactions WHERE month = p_month;
  DELETE FROM public.salaries WHERE month = p_month;
  DELETE FROM public.leave_manual_deductions WHERE created_at >= v_start AND created_at < v_end;
  DELETE FROM public.salary_manual_additions WHERE month = p_month;
  DELETE FROM public.attendance WHERE date >= v_start_date AND date < v_end_date;
  DELETE FROM public.leave_requests WHERE date >= v_start_date AND date < v_end_date;
  DELETE FROM public.overtime_requests WHERE start_at >= v_start AND start_at < v_end;
  DELETE FROM public.calendar_event_assignments
    WHERE event_id IN (
      SELECT id FROM public.calendar_events
      WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date
    );
  DELETE FROM public.calendar_events
    WHERE event_type = 'task' AND start_date >= v_start_date AND start_date < v_end_date;
  DELETE FROM public.tasks WHERE created_at >= v_start AND created_at < v_end;
END;
$function$;
