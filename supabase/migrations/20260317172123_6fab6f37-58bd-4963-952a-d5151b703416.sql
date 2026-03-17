
-- Add deduction_applied flag to attendance
ALTER TABLE public.attendance ADD COLUMN deduction_applied BOOLEAN NOT NULL DEFAULT false;

-- Create salaries table
CREATE TABLE public.salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  base_salary INTEGER NOT NULL DEFAULT 0,
  current_salary INTEGER NOT NULL DEFAULT 0,
  total_deductions INTEGER NOT NULL DEFAULT 0,
  month DATE NOT NULL, -- first day of the month
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own salary" ON public.salaries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own salary" ON public.salaries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own salary" ON public.salaries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Add base_salary to profiles so admin can set it per staff
ALTER TABLE public.profiles ADD COLUMN base_salary INTEGER NOT NULL DEFAULT 300000;
