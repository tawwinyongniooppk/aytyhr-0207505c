DROP POLICY IF EXISTS "carousel_slides read signed in" ON public.carousel_slides;
CREATE POLICY "carousel_slides read live slides" ON public.carousel_slides
  FOR SELECT TO authenticated USING (
    active = true
    AND (start_date IS NULL OR start_date <= (now() AT TIME ZONE 'Asia/Yangon')::date)
    AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'Asia/Yangon')::date)
  );