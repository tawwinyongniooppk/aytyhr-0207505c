CREATE OR REPLACE FUNCTION public.verify_cron_secret(p_candidate text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  expected text;
BEGIN
  SELECT decrypted_secret INTO expected
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  ORDER BY created_at DESC
  LIMIT 1;
  RETURN expected IS NOT NULL
    AND p_candidate IS NOT NULL
    AND encode(extensions.digest(p_candidate, 'sha256'), 'hex') = encode(extensions.digest(expected, 'sha256'), 'hex');
END;
$$;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;