
-- Add phone and join_date to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS join_date date DEFAULT CURRENT_DATE;

-- Allow all authenticated users to read all profiles (for staff listing)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Authenticated can read all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (true);
