
CREATE POLICY "Authenticated can read notification banners"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'notification-banners');

CREATE POLICY "IT Manager can upload notification banners"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'notification-banners' AND public.is_it_manager());

CREATE POLICY "IT Manager can update notification banners"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'notification-banners' AND public.is_it_manager())
  WITH CHECK (bucket_id = 'notification-banners' AND public.is_it_manager());

CREATE POLICY "IT Manager can delete notification banners"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'notification-banners' AND public.is_it_manager());
