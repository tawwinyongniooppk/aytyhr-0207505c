
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS payment_type text;

ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_payment_type_check;
ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_payment_type_check
  CHECK (payment_type IS NULL OR payment_type IN ('paid','unpaid'));

-- Backfill: existing approved rows are treated as paid
UPDATE public.leave_requests
   SET payment_type = 'paid'
 WHERE status = 'approved' AND payment_type IS NULL;

-- Track unpaid salary deduction so we can reverse it
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS unpaid_salary_deducted integer NOT NULL DEFAULT 0;

-- Update balance trigger: only Paid full leaves consume balance
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

  -- Approval transition (Paid only consumes balance)
  IF (
       (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved')
    OR (TG_OP = 'INSERT' AND NEW.status = 'approved')
    OR (TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status = 'approved'
        AND COALESCE(OLD.payment_type,'') <> 'paid' AND NEW.payment_type = 'paid')
  ) AND NEW.payment_type = 'paid' AND NOT COALESCE(NEW.balance_deducted,false) THEN

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

  -- Switching from Paid to Unpaid while still approved: refund the balance
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status = 'approved'
     AND COALESCE(OLD.payment_type,'') = 'paid' AND NEW.payment_type = 'unpaid'
     AND OLD.balance_deducted THEN
    UPDATE public.leave_balances
    SET balance = balance + 1, updated_at = now()
    WHERE user_id = NEW.user_id;
    NEW.balance_deducted := false;
  END IF;

  -- Reversal on un-approve
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

-- Salary deduction trigger for Unpaid full leave (one day = base_salary/30)
CREATE OR REPLACE FUNCTION public.apply_unpaid_leave_salary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date;
  v_base int;
  v_day_amount int;
  v_existing record;
BEGIN
  IF NEW.type <> 'leave' THEN
    RETURN NEW;
  END IF;

  v_month_start := date_trunc('month', NEW.date)::date;

  -- Apply: becoming approved+unpaid (and not already deducted)
  IF NEW.status = 'approved' AND NEW.payment_type = 'unpaid'
     AND COALESCE(NEW.unpaid_salary_deducted,0) = 0 THEN

    SELECT base_salary INTO v_base FROM public.profiles WHERE id = NEW.user_id;
    v_base := COALESCE(v_base, 300000);
    v_day_amount := GREATEST(0, (v_base / 30)::int);

    SELECT * INTO v_existing FROM public.salaries
      WHERE user_id = NEW.user_id AND month = v_month_start;

    IF NOT FOUND THEN
      INSERT INTO public.salaries (user_id, month, base_salary, current_salary, total_deductions)
      VALUES (NEW.user_id, v_month_start, v_base, GREATEST(0, v_base - v_day_amount), v_day_amount);
    ELSE
      UPDATE public.salaries
        SET current_salary = GREATEST(0, current_salary - v_day_amount),
            total_deductions = total_deductions + v_day_amount,
            last_updated = now()
        WHERE user_id = NEW.user_id AND month = v_month_start;
    END IF;

    NEW.unpaid_salary_deducted := v_day_amount;
  END IF;

  -- Reverse: was unpaid+approved, now unapproved or switched to paid
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved' AND OLD.payment_type = 'unpaid'
     AND COALESCE(OLD.unpaid_salary_deducted,0) > 0
     AND (NEW.status <> 'approved' OR NEW.payment_type <> 'unpaid') THEN

    UPDATE public.salaries
      SET current_salary = current_salary + OLD.unpaid_salary_deducted,
          total_deductions = GREATEST(0, total_deductions - OLD.unpaid_salary_deducted),
          last_updated = now()
      WHERE user_id = OLD.user_id AND month = v_month_start;

    NEW.unpaid_salary_deducted := 0;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS leave_balance_change ON public.leave_requests;
CREATE TRIGGER leave_balance_change
BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance_change();

DROP TRIGGER IF EXISTS leave_unpaid_salary ON public.leave_requests;
CREATE TRIGGER leave_unpaid_salary
BEFORE INSERT OR UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_unpaid_leave_salary();
