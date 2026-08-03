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
    AND length(expected) = length(p_candidate)
    AND extensions.crypt(p_candidate, extensions.crypt(expected, extensions.gen_salt('bf'))) = extensions.crypt(expected, extensions.crypt(expected, extensions.gen_salt('bf')));
END;
$$;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;

CREATE TABLE public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  banner_url text,
  action_target text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);
GRANT SELECT, UPDATE ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notification deliveries"
ON public.notification_deliveries FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "Users mark own notification deliveries read"
ON public.notification_deliveries FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_deliveries;
CREATE INDEX notification_deliveries_user_created_idx
ON public.notification_deliveries (user_id, created_at DESC);