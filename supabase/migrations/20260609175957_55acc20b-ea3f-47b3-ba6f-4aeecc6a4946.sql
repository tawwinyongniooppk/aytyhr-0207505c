-- Restrict IT Manager (and other authenticated users) from updating sensitive contact fields directly on profiles.
-- This also prevents UPDATE ... RETURNING phone/emergency_phone from leaking via the IT Manager UPDATE policy.
-- Sensitive fields (phone, emergency_phone) can only be changed by admin/assistant or by the row owner via service-role RPC paths.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  full_name,
  role,
  class,
  sequence,
  avatar_url,
  base_salary,
  check_in_time,
  check_out_time,
  work_day,
  join_date,
  work_schedule,
  deduction_rate_per_minute,
  late_deduction_per_minute,
  early_deduction_per_minute,
  partial_leave_deduction_per_minute,
  overtime_rate_per_minute
) ON public.profiles TO authenticated;
-- service_role retains full access for edge functions
GRANT ALL ON public.profiles TO service_role;