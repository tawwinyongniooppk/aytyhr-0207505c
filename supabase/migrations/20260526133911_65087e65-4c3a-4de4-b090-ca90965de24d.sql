
-- 1. bonus_transactions table
CREATE TABLE public.bonus_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_id UUID NULL,
  assignment_id UUID NULL,
  source TEXT NOT NULL DEFAULT 'task', -- 'task' | 'calendar'
  month DATE NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  unit_count INTEGER NOT NULL DEFAULT 1,
  deadline_date DATE NULL,
  approved_date DATE NULL,
  auto_approved BOOLEAN NOT NULL DEFAULT false,
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_bonus_tx_task ON public.bonus_transactions(task_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX ux_bonus_tx_ass ON public.bonus_transactions(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX ix_bonus_tx_user_month ON public.bonus_transactions(user_id, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_transactions TO authenticated;
GRANT ALL ON public.bonus_transactions TO service_role;

ALTER TABLE public.bonus_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or privileged"
ON public.bonus_transactions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager'))
);

CREATE POLICY "Admin insert bonus tx"
ON public.bonus_transactions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin update bonus tx"
ON public.bonus_transactions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin delete bonus tx"
ON public.bonus_transactions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. Flags on tasks & assignments
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.calendar_event_assignments ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT false;

-- 3. Helper RPC: monthly bonus split for a user. Returns per-unit amount = bonus / 4.
CREATE OR REPLACE FUNCTION public.compute_bonus_per_unit(p_user_id UUID, p_month DATE)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT bonus FROM public.salaries WHERE user_id = p_user_id AND month = p_month), 0) / 4;
$$;

GRANT EXECUTE ON FUNCTION public.compute_bonus_per_unit(UUID, DATE) TO authenticated;

-- 4. Monthly reset: clears bonus_transactions, salaries, leave_manual_deductions for a target month.
CREATE OR REPLACE FUNCTION public.monthly_reset_for(p_month DATE)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.bonus_transactions WHERE month = p_month;
  DELETE FROM public.salaries WHERE month = p_month;
  DELETE FROM public.leave_manual_deductions
    WHERE created_at >= p_month::timestamptz
      AND created_at < (p_month + INTERVAL '1 month')::timestamptz;
END;
$$;
