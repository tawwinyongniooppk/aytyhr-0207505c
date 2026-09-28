DROP POLICY IF EXISTS "carousel_slides read all" ON public.carousel_slides;
CREATE POLICY "carousel_slides read signed in" ON public.carousel_slides
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.carousel_slides FROM anon;

DROP POLICY IF EXISTS "Avatars read public" ON storage.objects;
CREATE POLICY "Avatars read by managers" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars' AND public.can_manage_branding());

DROP POLICY IF EXISTS "Branding read public" ON storage.objects;
CREATE POLICY "Branding read by managers" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'branding' AND public.can_manage_branding());

DROP POLICY IF EXISTS "Lesson plan assets are publicly readable" ON storage.objects;
CREATE POLICY "Lesson plan assets read by privileged" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'lesson-plan-assets'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('it_manager','admin'))
  );