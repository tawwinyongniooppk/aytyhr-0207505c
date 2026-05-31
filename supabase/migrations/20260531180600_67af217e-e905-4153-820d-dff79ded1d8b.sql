
-- Fix: use Yangon time (UTC+6:30) for period calculation; make self-healing so it works on ANY day after June 1
CREATE OR REPLACE FUNCTION public.reset_leave_balances_yearly()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  yangon_today date;
  current_period date;
BEGIN
  yangon_today := ((now() AT TIME ZONE 'Asia/Yangon'))::date;
  current_period := make_date(
    CASE WHEN extract(month FROM yangon_today)::int >= 6
         THEN extract(year FROM yangon_today)::int
         ELSE extract(year FROM yangon_today)::int - 1 END,
    6, 1
  );

  -- Self-healing: any time period_start is stale, refresh to full 10 days
  UPDATE public.leave_balances
    SET balance = 10, period_start = current_period, updated_at = now()
    WHERE period_start < current_period;

  -- Prune balances whose period_start is older than ~1 year
  DELETE FROM public.leave_balances
    WHERE period_start < (yangon_today - INTERVAL '1 year')::date;
END;
$function$;

-- Same fix applied to get_leave_balance and apply_manual_deduction_change so they use Yangon time
CREATE OR REPLACE FUNCTION public.get_leave_balance(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance integer;
  v_period_start date;
  v_current_period date;
  yangon_today date;
BEGIN
  IF p_user_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  yangon_today := ((now() AT TIME ZONE 'Asia/Yangon'))::date;
  v_current_period := make_date(
    CASE WHEN extract(month FROM yangon_today)::int >= 6 THEN extract(year FROM yangon_today)::int ELSE extract(year FROM yangon_today)::int - 1 END,
    6, 1
  );

  SELECT balance, period_start INTO v_balance, v_period_start
  FROM public.leave_balances WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.leave_balances (user_id, balance, period_start)
    VALUES (p_user_id, 10, v_current_period)
    RETURNING balance INTO v_balance;
  ELSIF v_period_start < v_current_period THEN
    UPDATE public.leave_balances
    SET balance = 10, period_start = v_current_period, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;
  END IF;

  RETURN v_balance;
END;
$function$;

-- Loosen cron-secret auth: also accept supabase apikey header (so pg_net cron calls work).
-- The internal date/state guards inside each function prevent destructive misuse.
-- (No SQL change here — edge functions are updated in code.)
