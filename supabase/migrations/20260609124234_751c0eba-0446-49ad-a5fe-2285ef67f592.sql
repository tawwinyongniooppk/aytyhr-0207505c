
-- Security definer helpers (avoid recursive RLS on profiles)
CREATE OR REPLACE FUNCTION public.is_admin_or_assistant()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant'));
$$;

CREATE OR REPLACE FUNCTION public.is_it_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager');
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Drop recursive policies
DROP POLICY IF EXISTS "Admin and assistant can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "IT Manager can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile no role change" ON public.profiles;
DROP POLICY IF EXISTS "Users read own or admin/assistant read all" ON public.profiles;

-- Recreate without self-referencing subqueries
CREATE POLICY "Users read own or privileged read all" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_admin_or_assistant() OR public.is_it_manager());

CREATE POLICY "Admin and assistant can update profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (public.is_admin_or_assistant())
WITH CHECK (public.is_admin_or_assistant());

CREATE POLICY "IT Manager can update profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (public.is_it_manager())
WITH CHECK (public.is_it_manager());

CREATE POLICY "Users can update own profile no role change" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = public.current_user_role());
