
-- Recreate profiles SELECT policy using SECURITY DEFINER helper functions
-- to avoid the recursive subquery on profiles-inside-profiles-policy.
DROP POLICY IF EXISTS "Users read own or admin reads all" ON public.profiles;
DROP POLICY IF EXISTS "Users read own or admin/it_manager read all" ON public.profiles;

CREATE POLICY "Users read own or admin assistant it_manager read all"
ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id
  OR public.is_admin_or_assistant()
  OR public.is_it_manager()
);
