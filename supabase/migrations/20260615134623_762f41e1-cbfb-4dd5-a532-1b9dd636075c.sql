
-- 1) Attendance: extend protected-fields guard to INSERT so staff cannot
-- pre-set deduction_applied / late_minutes / early_minutes on check-in.
CREATE OR REPLACE FUNCTION public.guard_attendance_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role bypass
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.deduction_applied, false) <> false
       OR COALESCE(NEW.late_minutes, 0) <> 0
       OR COALESCE(NEW.early_minutes, 0) <> 0 THEN
      RAISE EXCEPTION 'Staff cannot set deduction_applied / late_minutes / early_minutes on insert';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.late_minutes IS DISTINCT FROM OLD.late_minutes
     OR NEW.early_minutes IS DISTINCT FROM OLD.early_minutes
     OR NEW.deduction_applied IS DISTINCT FROM OLD.deduction_applied
     OR NEW.check_in_time IS DISTINCT FROM OLD.check_in_time
     OR NEW.check_in_lat IS DISTINCT FROM OLD.check_in_lat
     OR NEW.check_in_lng IS DISTINCT FROM OLD.check_in_lng
     OR NEW.check_in_distance IS DISTINCT FROM OLD.check_in_distance
     OR NEW.location_status IS DISTINCT FROM OLD.location_status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.date IS DISTINCT FROM OLD.date THEN
    RAISE EXCEPTION 'You can only update your own check-out fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_attendance_protected_fields_ins ON public.attendance;
CREATE TRIGGER guard_attendance_protected_fields_ins
BEFORE INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_protected_fields();

-- 2) Tasks: split UPDATE policy so staff cannot write approval columns.
DROP POLICY IF EXISTS "Users can update assigned tasks" ON public.tasks;

CREATE POLICY "Admin assistant can update any task"
ON public.tasks
FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')));

-- Staff (assignee) can update only while task is not yet approved/rejected,
-- and the WITH CHECK forbids them from writing approval/rejection columns.
CREATE POLICY "Assignee can update own task submission"
ON public.tasks
FOR UPDATE
USING (
  assignee_id = auth.uid()
)
WITH CHECK (
  assignee_id = auth.uid()
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND rejected_by IS NULL
  AND rejected_at IS NULL
  AND COALESCE(auto_approved, false) = false
  AND (submission_status IS NULL OR submission_status NOT IN ('approved','rejected'))
);

-- 3) calendar_event_assignments: same split.
DROP POLICY IF EXISTS "Users can update relevant assignments" ON public.calendar_event_assignments;

CREATE POLICY "Admin assistant can update any assignment"
ON public.calendar_event_assignments
FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')));

CREATE POLICY "Assignee can update own assignment submission"
ON public.calendar_event_assignments
FOR UPDATE
USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND rejected_by IS NULL
  AND rejected_at IS NULL
  AND COALESCE(auto_approved, false) = false
  AND (submission_status IS NULL OR submission_status NOT IN ('approved','rejected'))
);

-- 4) Update auto-checkout cron generator to send CRON_SECRET (no anon key).
CREATE OR REPLACE FUNCTION public.refresh_auto_checkout_schedule()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
DECLARE
  r record;
  job_name text;
  utc_min int;
  utc_h int;
  utc_m int;
  fn_url text := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-checkout';
  cron_secret text := 'Iloveyamin123@';
BEGIN
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
        'select net.http_post(url:=%L, headers:=%L::jsonb, body:=%L::jsonb);',
        fn_url,
        '{"Content-Type":"application/json","Authorization":"Bearer ' || cron_secret || '"}',
        '{}'
      )
    );
  END LOOP;
END;
$$;

SELECT public.refresh_auto_checkout_schedule();

-- 5) Re-create remaining anon-key cron jobs with CRON_SECRET auth.
SELECT cron.unschedule('attendance-morning-sweep-0830');
SELECT cron.unschedule('attendance-morning-sweep-0900');
SELECT cron.unschedule('attendance-noon-sweep-1200');
SELECT cron.unschedule('monthly-reset-daily');

SELECT cron.schedule(
  'attendance-morning-sweep-0830',
  '0 2 * * *',
  $cmd$SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-submit-missed-leave',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer Iloveyamin123@"}'::jsonb,
    body := '{}'::jsonb
  );$cmd$
);
SELECT cron.schedule(
  'attendance-morning-sweep-0900',
  '30 2 * * *',
  $cmd$SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-submit-missed-leave',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer Iloveyamin123@"}'::jsonb,
    body := '{}'::jsonb
  );$cmd$
);
SELECT cron.schedule(
  'attendance-noon-sweep-1200',
  '30 5 * * *',
  $cmd$SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/auto-submit-missed-leave',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer Iloveyamin123@"}'::jsonb,
    body := '{}'::jsonb
  );$cmd$
);
SELECT cron.schedule(
  'monthly-reset-daily',
  '28 17 28-31 * *',
  $cmd$SELECT net.http_post(
    url := 'https://bbopyxeqlymtndtomiwx.supabase.co/functions/v1/monthly-reset',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer Iloveyamin123@"}'::jsonb,
    body := '{}'::jsonb
  );$cmd$
);
