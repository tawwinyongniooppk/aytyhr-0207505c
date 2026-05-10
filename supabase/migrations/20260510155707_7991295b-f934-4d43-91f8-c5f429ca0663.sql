
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS late_deduction_per_minute integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS early_deduction_per_minute integer NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS partial_leave_deduction_per_minute integer NOT NULL DEFAULT 200;

-- Seed new per-type rates from any existing legacy single rate
UPDATE public.profiles
   SET late_deduction_per_minute = COALESCE(deduction_rate_per_minute, 200),
       early_deduction_per_minute = COALESCE(deduction_rate_per_minute, 200),
       partial_leave_deduction_per_minute = COALESCE(deduction_rate_per_minute, 200)
 WHERE late_deduction_per_minute = 200
   AND early_deduction_per_minute = 200
   AND partial_leave_deduction_per_minute = 200;
