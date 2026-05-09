
-- 1. Track whether a leave_request actually deducted balance
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS balance_deducted boolean NOT NULL DEFAULT false;

-- 2. Replace balance trigger to enforce 2-per-month auto cap
CREATE OR REPLACE FUNCTION public.apply_leave_balance_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_period date;
  v_month_start date;
  v_month_end date;
  v_approved_count int;
BEGIN
  IF NEW.type <> 'leave' THEN
    RETURN NEW;
  END IF;

  v_current_period := make_date(
    CASE WHEN extract(month FROM CURRENT_DATE)::int >= 6 THEN extract(year FROM CURRENT_DATE)::int ELSE extract(year FROM CURRENT_DATE)::int - 1 END,
    6, 1
  );

  -- Approval transition
  IF (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved')
     OR (TG_OP = 'INSERT' AND NEW.status = 'approved') THEN

    v_month_start := date_trunc('month', NEW.date)::date;
    v_month_end   := (v_month_start + INTERVAL '1 month')::date;

    SELECT count(*) INTO v_approved_count
    FROM public.leave_requests
    WHERE user_id = NEW.user_id
      AND type = 'leave'
      AND status = 'approved'
      AND id <> NEW.id
      AND date >= v_month_start
      AND date < v_month_end
      AND balance_deducted = true;

    IF v_approved_count < 2 THEN
      INSERT INTO public.leave_balances (user_id, balance, period_start)
      VALUES (NEW.user_id, 10, v_current_period)
      ON CONFLICT (user_id) DO NOTHING;

      UPDATE public.leave_balances
      SET balance = GREATEST(balance - 1, 0),
          updated_at = now()
      WHERE user_id = NEW.user_id;

      NEW.balance_deducted := true;
    ELSE
      NEW.balance_deducted := false;
    END IF;
  END IF;

  -- Reversal
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    IF OLD.balance_deducted THEN
      UPDATE public.leave_balances
      SET balance = balance + 1, updated_at = now()
      WHERE user_id = NEW.user_id;
      NEW.balance_deducted := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure trigger exists (BEFORE so we can mutate NEW.balance_deducted)
DROP TRIGGER IF EXISTS leave_requests_balance_trigger ON public.leave_requests;
CREATE TRIGGER leave_requests_balance_trigger
BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance_change();

-- 3. Manual deductions table
CREATE TABLE IF NOT EXISTS public.leave_manual_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  reason text NOT NULL DEFAULT '',
  days integer NOT NULL CHECK (days > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_manual_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can insert manual deductions"
  ON public.leave_manual_deductions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can delete manual deductions"
  ON public.leave_manual_deductions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Read own or admin/assistant"
  ON public.leave_manual_deductions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager'))
  );

-- 4. Trigger: applying / reversing manual deduction adjusts leave_balances
CREATE OR REPLACE FUNCTION public.apply_manual_deduction_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_period date;
BEGIN
  v_current_period := make_date(
    CASE WHEN extract(month FROM CURRENT_DATE)::int >= 6 THEN extract(year FROM CURRENT_DATE)::int ELSE extract(year FROM CURRENT_DATE)::int - 1 END,
    6, 1
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.leave_balances (user_id, balance, period_start)
    VALUES (NEW.user_id, 10, v_current_period)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.leave_balances
    SET balance = GREATEST(balance - NEW.days, 0),
        updated_at = now()
    WHERE user_id = NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.leave_balances
    SET balance = balance + OLD.days,
        updated_at = now()
    WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS manual_deduction_balance_trigger ON public.leave_manual_deductions;
CREATE TRIGGER manual_deduction_balance_trigger
AFTER INSERT OR DELETE ON public.leave_manual_deductions
FOR EACH ROW EXECUTE FUNCTION public.apply_manual_deduction_change();
