-- Branding bucket for company logo
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "Branding public read" ON storage.objects;
CREATE POLICY "Branding public read" ON storage.objects
FOR SELECT USING (bucket_id = 'branding');

-- IT manager-only writes
DROP POLICY IF EXISTS "IT manager insert branding" ON storage.objects;
CREATE POLICY "IT manager insert branding" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager'));

DROP POLICY IF EXISTS "IT manager update branding" ON storage.objects;
CREATE POLICY "IT manager update branding" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager'));

DROP POLICY IF EXISTS "IT manager delete branding" ON storage.objects;
CREATE POLICY "IT manager delete branding" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager'));

-- Allow IT Manager to insert/update app_settings (for company_logo_url key)
DROP POLICY IF EXISTS "IT manager can insert settings" ON public.app_settings;
CREATE POLICY "IT manager can insert settings" ON public.app_settings
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager'));

DROP POLICY IF EXISTS "IT manager can update settings" ON public.app_settings;
CREATE POLICY "IT manager can update settings" ON public.app_settings
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager'));