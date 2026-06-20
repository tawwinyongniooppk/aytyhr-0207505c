
-- Extend authenticated read access to include slip_signing keys so Staff can see whether signing is enabled.
DROP POLICY IF EXISTS "Authenticated can read operational settings" ON public.app_settings;
CREATE POLICY "Authenticated can read operational settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (key = ANY (ARRAY[
    'company_logo_url','company_name','start_time','end_time','grace_period_minutes',
    'school_latitude','school_longitude','allowed_radius_meters','deduction_rate_per_minute',
    'slip_signing_enabled','slip_signing_enabled_until'
  ]));

-- Allow Admin and Assistant Admin to toggle slip_signing_enabled / slip_signing_enabled_until.
DROP POLICY IF EXISTS "Admin or assistant manage slip signing insert" ON public.app_settings;
CREATE POLICY "Admin or assistant manage slip signing insert"
  ON public.app_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    key IN ('slip_signing_enabled','slip_signing_enabled_until')
    AND public.is_admin_or_assistant()
  );

DROP POLICY IF EXISTS "Admin or assistant manage slip signing update" ON public.app_settings;
CREATE POLICY "Admin or assistant manage slip signing update"
  ON public.app_settings
  FOR UPDATE
  TO authenticated
  USING (
    key IN ('slip_signing_enabled','slip_signing_enabled_until')
    AND public.is_admin_or_assistant()
  )
  WITH CHECK (
    key IN ('slip_signing_enabled','slip_signing_enabled_until')
    AND public.is_admin_or_assistant()
  );
