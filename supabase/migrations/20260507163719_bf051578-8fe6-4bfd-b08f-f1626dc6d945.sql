-- Add avatar_url and sequence to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS sequence integer NOT NULL DEFAULT 100;

ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_sequence_range CHECK (sequence >= 1 AND sequence <= 100);

-- Guard: only IT manager can change avatar_url or sequence
CREATE OR REPLACE FUNCTION public.guard_profile_it_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_it_manager boolean;
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.sequence IS DISTINCT FROM OLD.sequence THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'it_manager'
    ) INTO is_it_manager;
    IF NOT is_it_manager THEN
      RAISE EXCEPTION 'Only IT Manager can change profile photo or sequence';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_it_fields_trg ON public.profiles;
CREATE TRIGGER guard_profile_it_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_it_fields();

-- Update admin_list_profiles to sort by sequence then name
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')) THEN
    RETURN QUERY SELECT * FROM public.profiles ORDER BY sequence ASC, full_name ASC;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;

-- Grant column-level access (sequence + avatar_url readable by authenticated; sensitive cols still restricted)
GRANT SELECT (avatar_url, sequence) ON public.profiles TO authenticated;

-- Storage bucket for avatars (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: only IT manager can insert/update/delete; everyone authenticated can read (bucket is public anyway)
DROP POLICY IF EXISTS "Avatars publicly readable" ON storage.objects;
CREATE POLICY "Avatars publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "IT manager can upload avatars" ON storage.objects;
CREATE POLICY "IT manager can upload avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager')
);

DROP POLICY IF EXISTS "IT manager can update avatars" ON storage.objects;
CREATE POLICY "IT manager can update avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager')
);

DROP POLICY IF EXISTS "IT manager can delete avatars" ON storage.objects;
CREATE POLICY "IT manager can delete avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager')
);