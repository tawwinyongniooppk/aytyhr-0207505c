DROP POLICY IF EXISTS "Users can insert own attendance" ON public.attendance;
CREATE POLICY "Users can insert own attendance" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE(deduction_applied, false) = false
  );

DROP POLICY IF EXISTS "Users can insert own leave requests" ON public.leave_requests;
CREATE POLICY "Users can insert own leave requests" ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND COALESCE(balance_deducted, false) = false
    AND COALESCE(unpaid_salary_deducted, 0) = 0
  );

DROP POLICY IF EXISTS "Users insert own OT" ON public.overtime_requests;
CREATE POLICY "Users insert own OT" ON public.overtime_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );