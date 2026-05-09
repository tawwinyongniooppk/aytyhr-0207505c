ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

-- The existing apply_leave_balance_change trigger only acts when type = 'leave',
-- so 'partial_leave' (and 'late_excuse') correctly skip balance deduction.