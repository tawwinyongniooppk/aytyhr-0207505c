DROP POLICY IF EXISTS "Users read own or privileged read all" ON public.profiles;
CREATE POLICY "Users read own or admin/assistant read all"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin_or_assistant());