
-- Restrict app_settings anon access; expose only branding via a view
DROP POLICY IF EXISTS "Anyone can read settings (anon)" ON public.app_settings;
REVOKE SELECT ON public.app_settings FROM anon;

CREATE OR REPLACE VIEW public.public_branding
WITH (security_invoker=off) AS
  SELECT key, value, updated_at
  FROM public.app_settings
  WHERE key IN ('company_logo_url', 'company_name');

GRANT SELECT ON public.public_branding TO anon, authenticated;
