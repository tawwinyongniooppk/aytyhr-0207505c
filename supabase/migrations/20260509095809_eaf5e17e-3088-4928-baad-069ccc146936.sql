-- Leave balance table: one row per staff
CREATE TABLE IF NOT EXISTS public.leave_balances (
  user_id uuid PRIMARY KEY,
  balance integer NOT NULL DEFAULT 10,
  period_start date NOT NULL DEFAULT make_date(
    CASE WHEN extract(month FROM CURRENT_DATE)::int >= 6 THEN extract(year FROM CURRENT_DATE)::int ELSE extract(year FROM CURRENT_DATE)::int - 1 END,
    6, 1
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own balance or admin" ON public.leave_balances
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant','it_manager'))
  );

CREATE POLICY "Admin/assistant can upsert balance" ON public.leave_balances
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant'))
  );

CREATE POLICY "Admin/assistant can update balance" ON public.leave_balances
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant'))
  );

-- Function: get current balance with auto-reset on June 1 each year
CREATE OR REPLACE FUNCTION public.get_leave_balance(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_period_start date;
  v_current_period date;
BEGIN
  -- authorization: self or admin/assistant/it_manager
  IF p_user_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_current_period := make_date(
    CASE WHEN extract(month FROM CURRENT_DATE)::int >= 6 THEN extract(year FROM CURRENT_DATE)::int ELSE extract(year FROM CURRENT_DATE)::int - 1 END,
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
$$;

-- Trigger: decrement balance when leave_requests row goes to approved (type='leave' only)
CREATE OR REPLACE FUNCTION public.apply_leave_balance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_period date;
BEGIN
  IF NEW.type <> 'leave' THEN
    RETURN NEW;
  END IF;

  v_current_period := make_date(
    CASE WHEN extract(month FROM CURRENT_DATE)::int >= 6 THEN extract(year FROM CURRENT_DATE)::int ELSE extract(year FROM CURRENT_DATE)::int - 1 END,
    6, 1
  );

  -- Approval: deduct 1
  IF (TG_OP = 'UPDATE' AND OLD.status <> 'approved' AND NEW.status = 'approved')
     OR (TG_OP = 'INSERT' AND NEW.status = 'approved') THEN
    INSERT INTO public.leave_balances (user_id, balance, period_start)
    VALUES (NEW.user_id, 10, v_current_period)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.leave_balances
    SET balance = GREATEST(balance - 1, 0),
        updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;

  -- Reversal: if was approved and changed to something else, refund 1
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    UPDATE public.leave_balances
    SET balance = balance + 1, updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_leave_balance ON public.leave_requests;
CREATE TRIGGER trg_apply_leave_balance
AFTER INSERT OR UPDATE OF status ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance_change();

-- Retention cleanup function: keep balance row indefinitely (latest), archive optional history not stored
-- (Single row per user satisfies retention; nothing to delete.)