-- Allow Assistant Admin to insert/update/delete salary_manual_deductions
-- so Partial Leave approvals from Assistant Admin record the deduction
-- in real time (previously only `admin` role could insert, and the
-- silent RLS rejection meant approvals never produced a transaction).
DROP POLICY IF EXISTS "Admin insert smd" ON public.salary_manual_deductions;
DROP POLICY IF EXISTS "Admin delete smd" ON public.salary_manual_deductions;
DROP POLICY IF EXISTS "Admin update smd" ON public.salary_manual_deductions;

CREATE POLICY "Admin or assistant insert smd"
  ON public.salary_manual_deductions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_assistant());

CREATE POLICY "Admin or assistant delete smd"
  ON public.salary_manual_deductions
  FOR DELETE
  TO authenticated
  USING (public.is_admin_or_assistant());

CREATE POLICY "Admin or assistant update smd"
  ON public.salary_manual_deductions
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_assistant())
  WITH CHECK (public.is_admin_or_assistant());