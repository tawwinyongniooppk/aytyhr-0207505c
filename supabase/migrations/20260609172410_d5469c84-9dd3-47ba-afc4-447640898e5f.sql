
-- Carousel Slider feature
CREATE TABLE IF NOT EXISTS public.carousel_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  position text NOT NULL DEFAULT 'top' CHECK (position IN ('top','middle','bottom')),
  animation_style text NOT NULL DEFAULT 'continuous' CHECK (animation_style IN ('continuous','fade','slide-snap','pop')),
  animation_speed_seconds numeric NOT NULL DEFAULT 5,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.carousel_settings TO authenticated, anon;
GRANT ALL ON public.carousel_settings TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.carousel_settings TO authenticated;

ALTER TABLE public.carousel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carousel_settings read all" ON public.carousel_settings
  FOR SELECT USING (true);
CREATE POLICY "carousel_settings it manager write" ON public.carousel_settings
  FOR ALL TO authenticated
  USING (public.is_it_manager())
  WITH CHECK (public.is_it_manager());

INSERT INTO public.carousel_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.carousel_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  link_enabled boolean NOT NULL DEFAULT false,
  link_url text,
  start_date date,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.carousel_slides TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.carousel_slides TO authenticated;
GRANT ALL ON public.carousel_slides TO service_role;

ALTER TABLE public.carousel_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carousel_slides read all" ON public.carousel_slides
  FOR SELECT USING (true);
CREATE POLICY "carousel_slides it manager write" ON public.carousel_slides
  FOR ALL TO authenticated
  USING (public.is_it_manager())
  WITH CHECK (public.is_it_manager());

CREATE INDEX IF NOT EXISTS carousel_slides_sort_idx ON public.carousel_slides (sort_order);
