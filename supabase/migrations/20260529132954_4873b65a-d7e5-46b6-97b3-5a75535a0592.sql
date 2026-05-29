
DROP VIEW IF EXISTS public.public_branding;

CREATE POLICY "Anon can read branding only"
ON public.app_settings
FOR SELECT
TO anon
USING (key IN ('company_logo_url', 'company_name'));

GRANT SELECT ON public.app_settings TO anon;
