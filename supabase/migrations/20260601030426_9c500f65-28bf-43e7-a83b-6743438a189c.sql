-- 1) Convert leave_balances.balance to numeric so half-day leaves are representable
ALTER TABLE public.leave_balances ALTER COLUMN balance DROP DEFAULT;
ALTER TABLE public.leave_balances ALTER COLUMN balance TYPE numeric(5,1) USING balance::numeric(5,1);
ALTER TABLE public.leave_balances ALTER COLUMN balance SET DEFAULT 10;

-- 2) Replace get_leave_balance (return type changes to numeric -> drop then recreate)
DROP FUNCTION IF EXISTS public.get_leave_balance(uuid);

CREATE OR REPLACE FUNCTION public.get_leave_balance(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_period_start date;
  v_current_period date;
  yangon_today date;
BEGIN
  IF p_user_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  yangon_today := ((now() AT TIME ZONE 'Asia/Yangon'))::date;
  v_current_period := make_date(
    CASE WHEN extract(month FROM yangon_today)::int >= 6 THEN extract(year FROM yangon_today)::int ELSE extract(year FROM yangon_today)::int - 1 END,
    6, 1
  );

  SELECT balance, period_start INTO v_balance, v_period_start
  FROM public.leave_balances WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.leave_balances (user_id, balance, period_start)
    VALUES (p_user_id, 10, v_current_period)
    RETURNING balance INTO v_balance;
  ELSIF v_period_start < v_current_period THEN
    UPDATE public.leave_balances
    SET balance = 10, period_start = v_current_period, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;
  END IF;

  RETURN v_balance;
END;
$function$;

-- 3) Submission-time guard trigger for leave_requests
CREATE OR REPLACE FUNCTION public.enforce_leave_request_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  ws jsonb;
  day_name text;
  day_active boolean;
  v_month_start date;
  v_month_end date;
  v_equiv numeric;
  v_this numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')) INTO is_privileged;
  IF is_privileged THEN RETURN NEW; END IF;

  IF NEW.type NOT IN ('leave','half_leave') THEN
    RETURN NEW;
  END IF;

  SELECT work_schedule INTO ws FROM public.profiles WHERE id = NEW.user_id;
  day_name := to_char(NEW.date, 'FMDay');
  day_active := COALESCE((ws -> day_name ->> 'active')::boolean, true);
  IF NOT day_active THEN
    RAISE EXCEPTION 'OFF_DAY: သင်၏ Off Day အပေါ်တွင် Leave Request တင်လို့ မရပါ';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leave_requests
    WHERE user_id = NEW.user_id
      AND date = NEW.date
      AND type = NEW.type
      AND status <> 'rejected'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE: တရက်တည်းအတွက် တူညီသော Leave ကို နှစ်ကြိမ် ယူ၍ မရပါ';
  END IF;

  v_month_start := date_trunc('month', NEW.date)::date;
  v_month_end := (v_month_start + INTERVAL '1 month')::date;
  SELECT COALESCE(SUM(CASE WHEN type = 'leave' THEN 1 WHEN type = 'half_leave' THEN 0.5 ELSE 0 END), 0)
    INTO v_equiv
  FROM public.leave_requests
  WHERE user_id = NEW.user_id
    AND date >= v_month_start AND date < v_month_end
    AND status <> 'rejected';
  v_this := CASE WHEN NEW.type = 'leave' THEN 1 ELSE 0.5 END;
  IF (v_equiv + v_this) > 2 THEN
    RAISE EXCEPTION 'MONTHLY_LIMIT: တလအတွင်း ခွင့်ရက် (၂)ရက်ထက် ပိုပြီး ယူ၍ မရပါ';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_leave_request_submission ON public.leave_requests;
CREATE TRIGGER trg_enforce_leave_request_submission
BEFORE INSERT ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_leave_request_submission();

-- 4) Update balance change trigger to support half_leave (-0.5)
CREATE OR REPLACE FUNCTION public.apply_leave_balance_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_period date;
  v_units numeric;
BEGIN
  IF NEW.type NOT IN ('leave','half_leave') THEN
    RETURN NEW;
  END IF;
  v_units := CASE WHEN NEW.type = 'leave' THEN 1 ELSE 0.5 END;

  v_current_period := make_date(
    CASE WHEN extract(month FROM CURRENT_DATE)::int >= 6 THEN extract(year FROM CURRENT_DATE)::int ELSE extract(year FROM CURRENT_DATE)::int - 1 END,
    6, 1
  );

  IF (
       (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved')
    OR (TG_OP = 'INSERT' AND NEW.status = 'approved')
  ) AND COALESCE(NEW.payment_type, 'paid') = 'paid' AND NOT COALESCE(NEW.balance_deducted, false) THEN
    INSERT INTO public.leave_balances (user_id, balance, period_start)
    VALUES (NEW.user_id, 10, v_current_period)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.leave_balances
    SET balance = GREATEST(balance - v_units, 0),
        updated_at = now()
    WHERE user_id = NEW.user_id;

    NEW.balance_deducted := true;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' AND OLD.balance_deducted THEN
    UPDATE public.leave_balances
    SET balance = balance + v_units, updated_at = now()
    WHERE user_id = NEW.user_id;
    NEW.balance_deducted := false;
  END IF;

  RETURN NEW;
END;
$function$;