DROP POLICY IF EXISTS "carousel_settings read all" ON public.carousel_settings;
CREATE POLICY "carousel_settings read all" ON public.carousel_settings FOR SELECT TO authenticated USING (true);
REVOKE INSERT ON public.profiles FROM anon, authenticated;