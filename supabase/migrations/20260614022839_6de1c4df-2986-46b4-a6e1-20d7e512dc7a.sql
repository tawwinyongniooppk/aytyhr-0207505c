
-- 1) Harden self-update RLS on profiles: block role/financial column changes at the policy level
DROP POLICY IF EXISTS "Users can update own profile no role change" ON public.profiles;

CREATE POLICY "Users can update own profile no role change"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
  AND NOT (base_salary IS DISTINCT FROM (SELECT p.base_salary FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (overtime_rate_per_minute IS DISTINCT FROM (SELECT p.overtime_rate_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (deduction_rate_per_minute IS DISTINCT FROM (SELECT p.deduction_rate_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (late_deduction_per_minute IS DISTINCT FROM (SELECT p.late_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (early_deduction_per_minute IS DISTINCT FROM (SELECT p.early_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (partial_leave_deduction_per_minute IS DISTINCT FROM (SELECT p.partial_leave_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (sequence IS DISTINCT FROM (SELECT p.sequence FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (class IS DISTINCT FROM (SELECT p.class FROM public.profiles p WHERE p.id = profiles.id))
);

-- 2) Allow assistant to read salaries (matches existing UI access for Salaries & Bonuses page)
DROP POLICY IF EXISTS "Read own salary or admin" ON public.salaries;

CREATE POLICY "Read own salary or admin or assistant"
ON public.salaries
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')
  )
);
