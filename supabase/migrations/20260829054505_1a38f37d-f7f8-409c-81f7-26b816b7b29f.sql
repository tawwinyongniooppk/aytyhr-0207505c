CREATE OR REPLACE FUNCTION public.update_staff_attendance_settings(
  p_staff_id uuid,
  p_join_date date,
  p_check_in_time text,
  p_check_out_time text,
  p_work_day text,
  p_work_schedule jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_updated_count integer;
BEGIN
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'assistant') THEN
    RAISE EXCEPTION 'Only Admin or Assistant Admin can update staff attendance settings';
  END IF;

  IF p_check_in_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
     OR p_check_out_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'Invalid attendance time';
  END IF;

  IF p_work_day NOT IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
     OR jsonb_typeof(p_work_schedule) <> 'object' THEN
    RAISE EXCEPTION 'Invalid work schedule';
  END IF;

  UPDATE public.profiles
  SET join_date = p_join_date,
      check_in_time = p_check_in_time,
      check_out_time = p_check_out_time,
      work_day = p_work_day,
      work_schedule = p_work_schedule
  WHERE id = p_staff_id
    AND role IN ('staff', 'assistant');

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.update_staff_attendance_settings(uuid, date, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_staff_attendance_settings(uuid, date, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_staff_attendance_settings(uuid, date, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_attendance_settings(uuid, date, text, text, text, jsonb) TO service_role;