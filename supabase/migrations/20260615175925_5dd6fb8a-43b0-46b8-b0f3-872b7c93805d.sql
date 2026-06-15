DROP POLICY IF EXISTS "Users can update own attendance" ON public.attendance;

CREATE POLICY "Users can update own attendance checkout only"
ON public.attendance
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND NOT (user_id          IS DISTINCT FROM (SELECT a.user_id          FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (date             IS DISTINCT FROM (SELECT a.date             FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (check_in_time    IS DISTINCT FROM (SELECT a.check_in_time    FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (check_in_lat     IS DISTINCT FROM (SELECT a.check_in_lat     FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (check_in_lng     IS DISTINCT FROM (SELECT a.check_in_lng     FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (check_in_distance IS DISTINCT FROM (SELECT a.check_in_distance FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (location_status  IS DISTINCT FROM (SELECT a.location_status  FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (late_minutes     IS DISTINCT FROM (SELECT a.late_minutes     FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (early_minutes    IS DISTINCT FROM (SELECT a.early_minutes    FROM public.attendance a WHERE a.id = attendance.id))
  AND NOT (deduction_applied IS DISTINCT FROM (SELECT a.deduction_applied FROM public.attendance a WHERE a.id = attendance.id))
);