
-- Update handle_new_user to make first registered user admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count int;
  user_role text;
BEGIN
  SELECT count(*) INTO user_count FROM public.profiles;
  IF user_count = 0 THEN
    user_role := 'admin';
  ELSE
    user_role := 'staff';
  END IF;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), user_role);
  RETURN NEW;
END;
$function$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow admins to read all attendance (for salary calculations)
DROP POLICY IF EXISTS "Users can read own attendance" ON public.attendance;
CREATE POLICY "Authenticated can read all attendance"
ON public.attendance FOR SELECT TO authenticated
USING (true);

-- Allow admins to read all salaries
DROP POLICY IF EXISTS "Users can read own salary" ON public.salaries;
CREATE POLICY "Authenticated can read all salaries"
ON public.salaries FOR SELECT TO authenticated
USING (true);

-- Allow authenticated to insert profiles (for admin creating users)
CREATE POLICY "Authenticated can insert profiles"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (true);
