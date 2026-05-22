-- Helper to avoid RLS recursion when checking privileged roles
CREATE OR REPLACE FUNCTION public.is_privileged_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin','assistant','it_manager')
  );
$$;

-- Replace broad SELECT policy that exposed phone/salary/rate columns
-- to every authenticated user.
DROP POLICY IF EXISTS "Authenticated can read profiles non-sensitive" ON public.profiles;

CREATE POLICY "Users read own profile or privileged read all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR public.is_privileged_user()
);

-- Allow all authenticated users to call the existing public listing RPC,
-- which only returns id/full_name/role.
GRANT EXECUTE ON FUNCTION public.list_public_profiles() TO authenticated;
