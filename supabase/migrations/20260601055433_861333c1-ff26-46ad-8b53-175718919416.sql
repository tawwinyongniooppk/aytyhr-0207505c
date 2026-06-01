-- 1. Add half_period column to leave_requests
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS half_period text;

-- 2. Create salary_manual_deductions table
CREATE TABLE IF NOT EXISTS public.salary_manual_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month date NOT NULL DEFAULT (date_trunc('month', CURRENT_DATE))::date,
  title text NOT NULL,
  amount integer NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_manual_deductions TO authenticated;
GRANT ALL ON public.salary_manual_deductions TO service_role;

ALTER TABLE public.salary_manual_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or privileged smd"
  ON public.salary_manual_deductions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager'))
  );

CREATE POLICY "Admin insert smd"
  ON public.salary_manual_deductions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')));

CREATE POLICY "Admin delete smd"
  ON public.salary_manual_deductions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. Update leave validation: half-leave duplicates must also consider half_period
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
  v_equiv numeric;
  v_this numeric;
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
  SELECT COALESCE(SUM(CASE WHEN type = 'leave' THEN 1 WHEN type = 'half_leave' THEN 0.5 ELSE 0 END), 0)
    INTO v_equiv
  FROM public.leave_requests
  WHERE user_id = NEW.user_id
    AND date >= v_month_start AND date < v_month_end
    AND status <> 'rejected';
  v_this := CASE WHEN NEW.type = 'leave' THEN 1 ELSE 0.5 END;
  IF (v_equiv + v_this) > 2 THEN
    RAISE EXCEPTION 'MONTHLY_LIMIT: တလအတွင်း ခွင့်ရက် (၂)ရက်ထက် ပိုပြီး ယူ၍ မရပါ';
  END IF;

  RETURN NEW;
END;
$function$;
