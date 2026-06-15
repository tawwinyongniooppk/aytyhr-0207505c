
CREATE OR REPLACE FUNCTION public._get_cron_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v text;
BEGIN
  SELECT decrypted_secret INTO v
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  ORDER BY created_at DESC
  LIMIT 1;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public._get_cron_secret() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'CRON_SECRET') THEN
    PERFORM vault.create_secret('PLEASE_ROTATE_ME', 'CRON_SECRET', 'Bearer token for internal cron -> edge function calls');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_auto_checkout_schedule()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  r record;
  job_name text;
  utc_min int;
  utc_h int;
  utc_m int;
  fn_url text := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-checkout';
  cron_secret text;
BEGIN
  cron_secret := public._get_cron_secret();
  IF cron_secret IS NULL OR length(cron_secret) = 0 THEN
    RAISE EXCEPTION 'CRON_SECRET not configured in vault';
  END IF;

  FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'attendance-checkout-sweep-%' LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;

  FOR r IN
    WITH days AS (
      SELECT unnest(ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) AS d
    ),
    sched AS (
      SELECT (p.work_schedule -> d.d ->> 'check_out') AS co
      FROM public.profiles p, days d
      WHERE p.work_schedule IS NOT NULL
        AND (p.work_schedule -> d.d ->> 'active')::boolean = true
        AND (p.work_schedule -> d.d ->> 'check_out') IS NOT NULL
      UNION
      SELECT p.check_out_time::text FROM public.profiles p WHERE p.check_out_time IS NOT NULL
      UNION
      SELECT s.value FROM public.app_settings s WHERE s.key = 'end_time' AND s.value ~ '^[0-9]{1,2}:[0-9]{2}$'
      UNION
      SELECT '12:00'
    ),
    mins AS (
      SELECT DISTINCT
        ((split_part(co,':',1)::int * 60 + split_part(co,':',2)::int + 30) % 1440) AS mmt_min
      FROM sched WHERE co ~ '^[0-9]{1,2}:[0-9]{2}$'
    )
    SELECT mmt_min FROM mins
  LOOP
    utc_min := (r.mmt_min - 390 + 1440) % 1440;
    utc_h := utc_min / 60;
    utc_m := utc_min % 60;
    job_name := 'attendance-checkout-sweep-' || lpad(utc_h::text,2,'0') || lpad(utc_m::text,2,'0');
    PERFORM cron.schedule(
      job_name,
      utc_m::text || ' ' || utc_h::text || ' * * *',
      format(
        'select net.http_post(url:=%L, headers:=(''{"Content-Type":"application/json","Authorization":"Bearer '' || public._get_cron_secret() || ''"}'')::jsonb, body:=%L::jsonb);',
        fn_url,
        '{}'
      )
    );
  END LOOP;
END;
$function$;

DO $$
DECLARE
  jn text;
BEGIN
  FOR jn IN SELECT jobname FROM cron.job
            WHERE jobname IN ('auto-submit-missed-leave-daily','monthly-reset-job','auto-checkout-hourly','task-deadline-sweep-hourly','auto-weekly-task-credit-job')
  LOOP
    PERFORM cron.unschedule(jn);
  END LOOP;
END $$;

SELECT cron.schedule(
  'auto-submit-missed-leave-daily',
  '5 5 * * *',
  $cron$select net.http_post(
    url:='https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-submit-missed-leave',
    headers:=('{"Content-Type":"application/json","Authorization":"Bearer ' || public._get_cron_secret() || '"}')::jsonb,
    body:='{}'::jsonb
  );$cron$
);

SELECT cron.schedule(
  'monthly-reset-job',
  '0 17 1 * *',
  $cron$select net.http_post(
    url:='https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/monthly-reset',
    headers:=('{"Content-Type":"application/json","Authorization":"Bearer ' || public._get_cron_secret() || '"}')::jsonb,
    body:='{}'::jsonb
  );$cron$
);

SELECT cron.schedule(
  'auto-checkout-hourly',
  '*/15 * * * *',
  $cron$select net.http_post(
    url:='https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-checkout',
    headers:=('{"Content-Type":"application/json","Authorization":"Bearer ' || public._get_cron_secret() || '"}')::jsonb,
    body:='{}'::jsonb
  );$cron$
);

SELECT cron.schedule(
  'task-deadline-sweep-hourly',
  '0 * * * *',
  $cron$select net.http_post(
    url:='https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/task-deadline-sweep',
    headers:=('{"Content-Type":"application/json","Authorization":"Bearer ' || public._get_cron_secret() || '"}')::jsonb,
    body:='{}'::jsonb
  );$cron$
);

SELECT cron.schedule(
  'auto-weekly-task-credit-job',
  '0 0 * * 1',
  $cron$select net.http_post(
    url:='https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-weekly-task-credit',
    headers:=('{"Content-Type":"application/json","Authorization":"Bearer ' || public._get_cron_secret() || '"}')::jsonb,
    body:='{}'::jsonb
  );$cron$
);

SELECT public.refresh_auto_checkout_schedule();
