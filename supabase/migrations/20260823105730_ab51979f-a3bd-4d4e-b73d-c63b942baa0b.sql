
DROP POLICY IF EXISTS "Users read own or admin assistant it_manager read all" ON public.profiles;

CREATE POLICY "Users read own profile or admin reads all"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.current_user_role() = 'admin');
