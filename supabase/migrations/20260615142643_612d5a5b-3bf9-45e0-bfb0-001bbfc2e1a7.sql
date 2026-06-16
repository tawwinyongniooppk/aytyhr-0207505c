
-- 1. Profiles: pin role + financial fields in admin/assistant update policy
DROP POLICY IF EXISTS "Admin and assistant can update profiles" ON public.profiles;

CREATE POLICY "Admin and assistant can update profiles"
ON public.profiles
FOR UPDATE
USING (public.is_admin_or_assistant())
WITH CHECK (
  public.is_admin_or_assistant()
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id)
  AND NOT (base_salary IS DISTINCT FROM (SELECT p.base_salary FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (overtime_rate_per_minute IS DISTINCT FROM (SELECT p.overtime_rate_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (deduction_rate_per_minute IS DISTINCT FROM (SELECT p.deduction_rate_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (late_deduction_per_minute IS DISTINCT FROM (SELECT p.late_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (early_deduction_per_minute IS DISTINCT FROM (SELECT p.early_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id))
  AND NOT (partial_leave_deduction_per_minute IS DISTINCT FROM (SELECT p.partial_leave_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id))
);

-- 2. calendar_event_assignments: restrict blanket SELECT
DROP POLICY IF EXISTS "Authenticated can read assignments" ON public.calendar_event_assignments;

CREATE POLICY "Read own assignments or admin/assistant all"
ON public.calendar_event_assignments
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_admin_or_assistant()
);
