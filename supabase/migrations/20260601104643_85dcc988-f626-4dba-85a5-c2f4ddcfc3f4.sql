CREATE OR REPLACE FUNCTION public.enforce_leave_request_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean;
  ws jsonb;
  day_name text;
  day_active boolean;
  v_month_start date;
  v_month_end date;
  v_full_count int;
  v_half_count int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')) INTO is_privileged;
  IF is_privileged THEN RETURN NEW; END IF;

  IF NEW.type NOT IN ('leave','half_leave') THEN
    RETURN NEW;
  END IF;

  SELECT work_schedule INTO ws FROM public.profiles WHERE id = NEW.user_id;
  day_name := to_char(NEW.date, 'FMDay');
  day_active := COALESCE((ws -> day_name ->> 'active')::boolean, true);
  IF NOT day_active THEN
    RAISE EXCEPTION 'OFF_DAY: သင်၏ Off Day အပေါ်တွင် Leave Request တင်လို့ မရပါ';
  END IF;

  IF NEW.type = 'leave' THEN
    IF EXISTS (
      SELECT 1 FROM public.leave_requests
      WHERE user_id = NEW.user_id AND date = NEW.date AND type = 'leave' AND status <> 'rejected'
    ) THEN
      RAISE EXCEPTION 'DUPLICATE: တရက်တည်းအတွက် တူညီသော Leave ကို နှစ်ကြိမ် ယူ၍ မရပါ';
    END IF;
  ELSIF NEW.type = 'half_leave' THEN
    IF EXISTS (
      SELECT 1 FROM public.leave_requests
      WHERE user_id = NEW.user_id AND date = NEW.date AND type = 'half_leave'
        AND COALESCE(half_period,'') = COALESCE(NEW.half_period,'')
        AND status <> 'rejected'
    ) THEN
      RAISE EXCEPTION 'DUPLICATE: တရက်တည်းအတွက် တူညီသော Half Leave ကို နှစ်ကြိမ် ယူ၍ မရပါ';
    END IF;
  END IF;

  v_month_start := date_trunc('month', NEW.date)::date;
  v_month_end := (v_month_start + INTERVAL '1 month')::date;

  SELECT
    COUNT(*) FILTER (WHERE type = 'leave'),
    COUNT(*) FILTER (WHERE type = 'half_leave')
  INTO v_full_count, v_half_count
  FROM public.leave_requests
  WHERE user_id = NEW.user_id
    AND date >= v_month_start AND date < v_month_end
    AND status <> 'rejected';

  IF NEW.type = 'leave' AND (v_full_count + 1) > 2 THEN
    RAISE EXCEPTION 'MONTHLY_LIMIT_FULL: တလအတွင်း Full Leave (၂)ကြိမ်ထက် ပိုပြီး ယူ၍ မရပါ';
  END IF;

  IF NEW.type = 'half_leave' AND (v_half_count + 1) > 4 THEN
    RAISE EXCEPTION 'MONTHLY_LIMIT_HALF: တလအတွင်း Half Leave (၄)ကြိမ်ထက် ပိုပြီး ယူ၍ မရပါ';
  END IF;

  RETURN NEW;
END;
$function$;