-- 1) Lesson plan templates: scope SELECT to own class (or privileged roles)
DROP POLICY IF EXISTS "Authenticated can read templates" ON public.lesson_plan_templates;

CREATE POLICY "Read templates for own class or privileged"
  ON public.lesson_plan_templates FOR SELECT
  TO authenticated
  USING (
    public.is_privileged_user()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.class = lesson_plan_templates.class
    )
  );

-- IT Manager can delete a template format (editor supports deletion)
GRANT DELETE ON public.lesson_plan_templates TO authenticated;

DROP POLICY IF EXISTS "IT Manager can delete templates" ON public.lesson_plan_templates;
CREATE POLICY "IT Manager can delete templates"
  ON public.lesson_plan_templates FOR DELETE
  TO authenticated
  USING (public.is_it_manager());

-- 2) Notification banners: restrict direct object reads to IT managers / admins
DROP POLICY IF EXISTS "Authenticated can read notification banners" ON storage.objects;

CREATE POLICY "IT Manager or admin can read notification banners"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'notification-banners'
    AND public.is_admin_or_it_manager()
  );