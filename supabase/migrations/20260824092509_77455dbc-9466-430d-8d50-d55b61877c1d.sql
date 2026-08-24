ALTER TABLE public.salary_manual_additions ADD COLUMN IF NOT EXISTS effective_date date;
ALTER TABLE public.salary_manual_deductions ADD COLUMN IF NOT EXISTS effective_date date;