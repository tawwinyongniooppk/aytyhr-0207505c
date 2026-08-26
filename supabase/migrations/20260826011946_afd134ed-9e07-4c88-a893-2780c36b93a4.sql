DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'attendance-missed-leave-sweep-every-5min',
      'attendance-auto-sweep-every-5min',
      'auto-submit-missed-leave-every-5min',
      'auto-submit-missed-leave-daily',
      'attendance-morning-sweep-0830',
      'attendance-morning-sweep-0900',
      'attendance-noon-sweep-1200'
    )
    OR command ILIKE '%auto-submit-missed-leave%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.seed_monthly_salaries(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_monthly_salaries(date) TO service_role;