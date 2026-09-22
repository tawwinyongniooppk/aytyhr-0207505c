CREATE OR REPLACE FUNCTION public.guard_overtime_approved_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
BEGIN
  -- OT-3B-5: approved overtime is financially final and must stay linked to its
  -- salary transaction. Only the system cleanup path (service role / Monthly Reset,
  -- which runs SECURITY DEFINER as postgres) may remove approved rows.
  IF OLD.status = 'approved'
     AND auth.uid() IS NOT NULL
     AND current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'OT_APPROVED_DELETE_FORBIDDEN';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_overtime_approved_delete() FROM PUBLIC;