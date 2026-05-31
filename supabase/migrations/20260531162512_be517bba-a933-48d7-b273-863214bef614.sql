CREATE TABLE public.lesson_plan_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class text NOT NULL UNIQUE CHECK (class IN ('Beginner','Junior','Senior')),
  template_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.lesson_plan_templates TO authenticated;
GRANT ALL ON public.lesson_plan_templates TO service_role;

ALTER TABLE public.lesson_plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read templates"
  ON public.lesson_plan_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "IT Manager can insert templates"
  ON public.lesson_plan_templates FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager')
  );

CREATE POLICY "IT Manager can update templates"
  ON public.lesson_plan_templates FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'it_manager')
  );

-- Seed empty rows for the three classes (idempotent)
INSERT INTO public.lesson_plan_templates (class, template_json)
VALUES ('Beginner', '{}'::jsonb), ('Junior', '{}'::jsonb), ('Senior', '{}'::jsonb)
ON CONFLICT (class) DO NOTHING;