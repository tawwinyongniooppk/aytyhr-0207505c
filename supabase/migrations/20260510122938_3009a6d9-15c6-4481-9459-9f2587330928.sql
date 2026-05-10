
-- Helper: true if current user is it_manager or admin
CREATE OR REPLACE FUNCTION public.can_manage_branding()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('it_manager','admin')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_branding() TO authenticated;

-- Storage: branding bucket
DROP POLICY IF EXISTS "IT manager insert branding" ON storage.objects;
DROP POLICY IF EXISTS "IT manager update branding" ON storage.objects;
DROP POLICY IF EXISTS "IT manager delete branding" ON storage.objects;
DROP POLICY IF EXISTS "Branding read public" ON storage.objects;

CREATE POLICY "Branding read public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

CREATE POLICY "Branding insert by managers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.can_manage_branding());

CREATE POLICY "Branding update by managers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND public.can_manage_branding())
  WITH CHECK (bucket_id = 'branding' AND public.can_manage_branding());

CREATE POLICY "Branding delete by managers"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND public.can_manage_branding());

-- Storage: avatars bucket
DROP POLICY IF EXISTS "IT manager can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "IT manager can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "IT manager can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatars read public" ON storage.objects;

CREATE POLICY "Avatars read public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Avatars insert by managers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND public.can_manage_branding());

CREATE POLICY "Avatars update by managers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND public.can_manage_branding())
  WITH CHECK (bucket_id = 'avatars' AND public.can_manage_branding());

CREATE POLICY "Avatars delete by managers"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND public.can_manage_branding());

-- app_settings: allow IT Manager and Admin to insert/update via one rule
DROP POLICY IF EXISTS "Admin can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admin can update settings" ON public.app_settings;
DROP POLICY IF EXISTS "IT manager can insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "IT manager can update settings" ON public.app_settings;

CREATE POLICY "Managers can insert settings"
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_branding());

CREATE POLICY "Managers can update settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.can_manage_branding())
  WITH CHECK (public.can_manage_branding());
