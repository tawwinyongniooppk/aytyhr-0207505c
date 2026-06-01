-- Add format column to lesson_plan_templates and switch unique key to (class, format)
ALTER TABLE public.lesson_plan_templates
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'format1';

ALTER TABLE public.lesson_plan_templates
  ADD CONSTRAINT lesson_plan_templates_format_chk CHECK (format IN ('format1','format2'));

-- Drop any prior unique constraint on class alone, then add composite unique
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.lesson_plan_templates'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.lesson_plan_templates DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.lesson_plan_templates
  ADD CONSTRAINT lesson_plan_templates_class_format_key UNIQUE (class, format);

-- Storage bucket for lesson plan assets (logos, watermarks, free-element images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lesson-plan-assets', 'lesson-plan-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read; IT Manager / Admin can upload, update, delete
CREATE POLICY "Lesson plan assets are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lesson-plan-assets');

CREATE POLICY "Privileged can upload lesson plan assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-plan-assets'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('it_manager','admin'))
  );

CREATE POLICY "Privileged can update lesson plan assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'lesson-plan-assets'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('it_manager','admin'))
  );

CREATE POLICY "Privileged can delete lesson plan assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'lesson-plan-assets'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('it_manager','admin'))
  );