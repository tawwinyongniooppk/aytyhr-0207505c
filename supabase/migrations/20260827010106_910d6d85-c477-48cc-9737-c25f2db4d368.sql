CREATE OR REPLACE FUNCTION public.reset_checkin_on_morning_half_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'half_leave'
     AND NEW.half_period = 'morning'
     AND COALESCE(NEW.status, 'pending') <> 'rejected' THEN
    UPDATE public.attendance
       SET check_in_time = NULL,
           late_minutes = 0,
           early_minutes = 0,
           deduction_applied = false
     WHERE user_id = NEW.user_id
       AND date = NEW.date
       AND check_out_time IS NULL
       AND check_in_time IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_checkin_on_morning_half_leave ON public.leave_requests;
CREATE TRIGGER trg_reset_checkin_on_morning_half_leave
AFTER INSERT ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.reset_checkin_on_morning_half_leave();