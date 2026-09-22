CREATE OR REPLACE FUNCTION public.guard_overtime_approved_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- OT-3B-5: approved overtime is financially final and must stay linked to its
  -- salary transaction. Only the system cleanup path (service role / Monthly Reset
  -- cron, i.e. no authenticated end user) may remove approved rows.
  IF OLD.status = 'approved'
     AND auth.uid() IS NOT NULL
     AND current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'OT_APPROVED_DELETE_FORBIDDEN';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_overtime_approved_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_overtime_approved_delete ON public.overtime_requests;
CREATE TRIGGER trg_guard_overtime_approved_delete
BEFORE DELETE ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_overtime_approved_delete();