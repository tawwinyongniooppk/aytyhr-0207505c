-- Manual salary additions (admin-only, per-month bonus additions outside the bonus pot)
CREATE TABLE public.salary_manual_additions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  month date NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  title text NOT NULL,
  amount integer NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_manual_additions TO authenticated;
GRANT ALL ON public.salary_manual_additions TO service_role;

ALTER TABLE public.salary_manual_additions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or admin/assistant/it"
  ON public.salary_manual_additions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager'))
  );

CREATE POLICY "Admin can insert manual additions"
  ON public.salary_manual_additions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete manual additions"
  ON public.salary_manual_additions FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX idx_salary_manual_additions_user_month
  ON public.salary_manual_additions(user_id, month);

-- Extend purge to also clean old manual addition logs
CREATE OR REPLACE FUNCTION public.purge_old_salary_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cutoff date;
BEGIN
  IF extract(day FROM CURRENT_DATE)::int <= 2 THEN
    cutoff := (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date;
  ELSE
    cutoff := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  DELETE FROM public.salaries WHERE month < cutoff;
  DELETE FROM public.leave_manual_deductions WHERE created_at < cutoff;
  DELETE FROM public.salary_manual_additions WHERE month < cutoff;
END;
$function$;