
-- Fix 1: Prevent IT Manager privilege escalation by pinning role on UPDATE.
DROP POLICY IF EXISTS "IT Manager can update profiles" ON public.profiles;
CREATE POLICY "IT Manager can update profiles"
ON public.profiles
FOR UPDATE
USING (is_it_manager())
WITH CHECK (
  is_it_manager()
  AND (role = (SELECT p.role FROM public.profiles p WHERE p.id = profiles.id))
  AND (NOT (base_salary IS DISTINCT FROM (SELECT p.base_salary FROM public.profiles p WHERE p.id = profiles.id)))
  AND (NOT (overtime_rate_per_minute IS DISTINCT FROM (SELECT p.overtime_rate_per_minute FROM public.profiles p WHERE p.id = profiles.id)))
  AND (NOT (deduction_rate_per_minute IS DISTINCT FROM (SELECT p.deduction_rate_per_minute FROM public.profiles p WHERE p.id = profiles.id)))
  AND (NOT (late_deduction_per_minute IS DISTINCT FROM (SELECT p.late_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id)))
  AND (NOT (early_deduction_per_minute IS DISTINCT FROM (SELECT p.early_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id)))
  AND (NOT (partial_leave_deduction_per_minute IS DISTINCT FROM (SELECT p.partial_leave_deduction_per_minute FROM public.profiles p WHERE p.id = profiles.id)))
);

-- Fix 2: Scope authenticated app_settings reads to the known operational/branding keys
-- so any future internal configuration key is not silently exposed to all staff.
DROP POLICY IF EXISTS "Anyone authenticated can read settings" ON public.app_settings;
CREATE POLICY "Authenticated can read operational settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (key = ANY (ARRAY[
  'company_logo_url',
  'company_name',
  'start_time',
  'end_time',
  'grace_period_minutes',
  'school_latitude',
  'school_longitude',
  'allowed_radius_meters',
  'deduction_rate_per_minute'
]));
