CREATE OR REPLACE FUNCTION public.approve_overtime_request(p_overtime_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_ot public.overtime_requests%ROWTYPE;
  v_rate integer;
  v_rate_found boolean := false;
  v_minutes integer;
  v_amount integer;
  v_month date;
  v_title text;
  v_existing uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_caller;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'assistant') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_ot FROM public.overtime_requests WHERE id = p_overtime_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OT_NOT_FOUND';
  END IF;

  IF v_ot.status = 'rejected' THEN
    RAISE EXCEPTION 'OT_REJECTED';
  END IF;

  IF v_ot.status = 'approved' THEN
    SELECT id INTO v_existing FROM public.salary_manual_additions
      WHERE overtime_request_id = p_overtime_id;
    IF v_existing IS NULL THEN
      RAISE EXCEPTION 'OT_APPROVED_WITHOUT_PAYMENT';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'overtime_id', p_overtime_id,
      'minutes', v_ot.minutes,
      'rate_per_minute', v_ot.rate_per_minute,
      'amount', v_ot.amount,
      'month', to_char(date_trunc('month', (v_ot.start_at AT TIME ZONE 'Asia/Yangon')::date)::date, 'YYYY-MM-DD'),
      'already_applied', true
    );
  END IF;

  -- A1: authoritative rate, no invented fallback.
  SELECT overtime_rate_per_minute, true INTO v_rate, v_rate_found
    FROM public.profiles WHERE id = v_ot.user_id;

  IF NOT COALESCE(v_rate_found, false) OR v_rate IS NULL THEN
    RAISE EXCEPTION 'OT_RATE_NOT_CONFIGURED';
  END IF;

  IF v_rate <= 0 THEN
    RAISE EXCEPTION 'OT_RATE_INVALID';
  END IF;

  v_minutes := GREATEST(0, (EXTRACT(EPOCH FROM (v_ot.end_at - v_ot.start_at)) / 60)::int);
  v_amount := v_minutes * v_rate;
  v_month := date_trunc('month', (v_ot.start_at AT TIME ZONE 'Asia/Yangon')::date)::date;
  v_title := 'Overtime Payment: ' || v_ot.title;

  UPDATE public.overtime_requests
     SET status = 'approved',
         reviewed_by = v_caller,
         reviewed_at = now(),
         minutes = v_minutes,
         rate_per_minute = v_rate,
         amount = v_amount
   WHERE id = p_overtime_id;

  IF v_amount > 0 THEN
    BEGIN
      INSERT INTO public.salary_manual_additions
        (user_id, created_by, month, title, amount, kind, overtime_request_id)
      VALUES
        (v_ot.user_id, v_caller, v_month, v_title, v_amount, 'auto', p_overtime_id);
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_existing FROM public.salary_manual_additions
        WHERE overtime_request_id = p_overtime_id;
      IF v_existing IS NULL THEN
        RAISE;
      END IF;
      RETURN jsonb_build_object(
        'ok', true, 'overtime_id', p_overtime_id, 'minutes', v_minutes,
        'rate_per_minute', v_rate, 'amount', v_amount,
        'month', to_char(v_month, 'YYYY-MM-DD'), 'already_applied', true
      );
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'overtime_id', p_overtime_id, 'minutes', v_minutes,
    'rate_per_minute', v_rate, 'amount', v_amount,
    'month', to_char(v_month, 'YYYY-MM-DD'), 'already_applied', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_overtime_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_overtime_request(uuid) TO authenticated;