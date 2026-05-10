ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deduction_rate_per_minute integer NOT NULL DEFAULT 200;