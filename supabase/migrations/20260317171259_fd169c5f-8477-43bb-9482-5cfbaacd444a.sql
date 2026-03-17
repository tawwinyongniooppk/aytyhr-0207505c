
-- Drop the overly permissive policy and replace with specific ones
DROP POLICY "Anyone authenticated can upsert settings" ON public.app_settings;

CREATE POLICY "Authenticated can insert settings" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update settings" ON public.app_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
