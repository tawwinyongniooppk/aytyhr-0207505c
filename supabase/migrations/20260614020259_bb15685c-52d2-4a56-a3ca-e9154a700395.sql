
-- Remove IT Manager from SELECT policies on salary/bonus-related tables.
-- IT Managers must not see any staff financial data.

DROP POLICY IF EXISTS "Read own or privileged" ON public.bonus_transactions;
CREATE POLICY "Read own or admin/assistant"
ON public.bonus_transactions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles
             WHERE id = auth.uid() AND role IN ('admin','assistant'))
);

DROP POLICY IF EXISTS "Read own or admin/assistant" ON public.leave_manual_deductions;
CREATE POLICY "Read own or admin/assistant"
ON public.leave_manual_deductions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles
             WHERE id = auth.uid() AND role IN ('admin','assistant'))
);

DROP POLICY IF EXISTS "Read own or admin/assistant/it" ON public.salary_manual_additions;
CREATE POLICY "Read own or admin/assistant"
ON public.salary_manual_additions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles
             WHERE id = auth.uid() AND role IN ('admin','assistant'))
);

DROP POLICY IF EXISTS "Read own or privileged smd" ON public.salary_manual_deductions;
CREATE POLICY "Read own or admin/assistant"
ON public.salary_manual_deductions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles
             WHERE id = auth.uid() AND role IN ('admin','assistant'))
);

-- Tighten IT Manager UPDATE on profiles: ensure salary-sensitive columns
-- cannot change. The existing guard_profile_base_salary trigger already
-- raises on financial-column writes by non-admins; we additionally lock the
-- policy WITH CHECK to be explicit so static analysis can confirm intent.
DROP POLICY IF EXISTS "IT Manager can update profiles" ON public.profiles;
CREATE POLICY "IT Manager can update profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (is_it_manager())
WITH CHECK (
  is_it_manager()
  AND base_salary IS NOT DISTINCT FROM (SELECT base_salary FROM public.profiles p WHERE p.id = profiles.id)
  AND overtime_rate_per_minute IS NOT DISTINCT FROM (SELECT overtime_rate_per_minute FROM public.profiles p WHERE p.id = profiles.id)
  AND deduction_rate_per_minute IS NOT DISTINCT FROM (SELECT deduction_rate_per_minute FROM public.profiles p WHERE p.id = profiles.id)
  AND late_deduction_per_minute IS NOT DISTINCT FROM (SELECT late_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id)
  AND early_deduction_per_minute IS NOT DISTINCT FROM (SELECT early_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id)
  AND partial_leave_deduction_per_minute IS NOT DISTINCT FROM (SELECT partial_leave_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id)
);
