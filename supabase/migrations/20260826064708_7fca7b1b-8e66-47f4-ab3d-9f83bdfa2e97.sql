CREATE OR REPLACE FUNCTION public.get_leave_balances_all(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_balance numeric;
BEGIN
  FOREACH v_id IN ARRAY COALESCE(p_user_ids, ARRAY[]::uuid[]) LOOP
    -- Reuses the existing per-user function so calculation AND authorization
    -- semantics stay byte-for-byte identical (it raises if not authorized).
    v_balance := public.get_leave_balance(v_id);
    user_id := v_id;
    balance := v_balance;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_leave_balances_all(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leave_balances_all(uuid[]) TO authenticated, service_role;