ALTER TABLE public.salaries
  ADD COLUMN IF NOT EXISTS bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_deduction integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_reason text NOT NULL DEFAULT '';