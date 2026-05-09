-- Allow admin/assistant to delete old leave_requests for retention cleanup.
-- The current leave balance lives in `leave_balances` and is unaffected.
CREATE POLICY "Admin assistant can delete leave requests"
ON public.leave_requests
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin','assistant')
  )
);