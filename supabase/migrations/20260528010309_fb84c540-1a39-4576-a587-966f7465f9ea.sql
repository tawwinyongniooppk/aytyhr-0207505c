-- Allow anonymous (logged-out) visitors to read branding settings
-- so the IT-Manager-uploaded logo appears on /login and in the PWA manifest.
GRANT SELECT ON public.app_settings TO anon;

CREATE POLICY "Anyone can read settings (anon)"
ON public.app_settings
FOR SELECT
TO anon
USING (true);