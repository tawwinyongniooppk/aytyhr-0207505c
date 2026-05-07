
-- ============ PROFILES ============
DROP POLICY IF EXISTS "Authenticated can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Read own or privileged profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant','it_manager'))
);

CREATE POLICY "Insert own staff profile only"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND role = 'staff');

CREATE POLICY "Users can update own profile no role change"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- Safe view for name lookups (id, name, role) usable by all authenticated users
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT id, full_name, role FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;

-- Allow the view to bypass profiles RLS via a permissive policy keyed to view access.
-- (security_invoker view still hits underlying RLS; add a SELECT policy that exposes only
-- non-sensitive columns by allowing read of profiles when accessed from view context.)
-- Since RLS can't be column-scoped, expose minimal-row read via a separate SECURITY DEFINER function
DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE FUNCTION public.list_public_profiles()
RETURNS TABLE(id uuid, full_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, full_name, role FROM public.profiles;
$$;
REVOKE ALL ON FUNCTION public.list_public_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_profiles() TO authenticated;

-- ============ SALARIES ============
DROP POLICY IF EXISTS "Authenticated can read all salaries" ON public.salaries;
DROP POLICY IF EXISTS "Users can update own salary" ON public.salaries;
DROP POLICY IF EXISTS "Users can insert own salary" ON public.salaries;

CREATE POLICY "Read own salary or admin"
ON public.salaries FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant'))
);

CREATE POLICY "Admin assistant can insert salaries"
ON public.salaries FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant'))
);

CREATE POLICY "Admin assistant can update salaries"
ON public.salaries FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')));

-- ============ ATTENDANCE ============
DROP POLICY IF EXISTS "Authenticated can read all attendance" ON public.attendance;

CREATE POLICY "Read own attendance or admin"
ON public.attendance FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant'))
);

-- ============ LEAVE REQUESTS ============
DROP POLICY IF EXISTS "Authenticated can read all leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can update own leave requests" ON public.leave_requests;

CREATE POLICY "Read own leave or admin"
ON public.leave_requests FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant'))
);

-- Staff can only update their own pending request and cannot change review fields
CREATE POLICY "Users update own pending leave"
ON public.leave_requests FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

CREATE POLICY "Admin assistant can update any leave"
ON public.leave_requests FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')));

-- ============ APP SETTINGS ============
DROP POLICY IF EXISTS "Authenticated can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated can update settings" ON public.app_settings;

CREATE POLICY "Admin can insert settings"
ON public.app_settings FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admin can update settings"
ON public.app_settings FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ============ Lock down trigger functions ============
REVOKE EXECUTE ON FUNCTION public.guard_profile_role_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_base_salary() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_salary_financial_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
