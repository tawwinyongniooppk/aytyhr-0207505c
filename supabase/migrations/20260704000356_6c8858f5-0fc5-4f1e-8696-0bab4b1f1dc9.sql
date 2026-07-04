
-- 1) tasks: restrict UPDATE policies to authenticated role
DROP POLICY IF EXISTS "Admin assistant can update any task" ON public.tasks;
CREATE POLICY "Admin assistant can update any task"
ON public.tasks FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','assistant')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','assistant')));

DROP POLICY IF EXISTS "Assignee can update own task submission" ON public.tasks;
CREATE POLICY "Assignee can update own task submission"
ON public.tasks FOR UPDATE TO authenticated
USING (assignee_id = auth.uid())
WITH CHECK (
  assignee_id = auth.uid()
  AND approved_by IS NULL AND approved_at IS NULL
  AND rejected_by IS NULL AND rejected_at IS NULL
  AND COALESCE(auto_approved, false) = false
  AND (submission_status IS NULL OR submission_status NOT IN ('approved','rejected'))
);

-- 2) calendar_event_assignments: restrict UPDATE policies to authenticated role
DROP POLICY IF EXISTS "Admin assistant can update any assignment" ON public.calendar_event_assignments;
CREATE POLICY "Admin assistant can update any assignment"
ON public.calendar_event_assignments FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','assistant')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','assistant')));

DROP POLICY IF EXISTS "Assignee can update own assignment submission" ON public.calendar_event_assignments;
CREATE POLICY "Assignee can update own assignment submission"
ON public.calendar_event_assignments FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND approved_by IS NULL AND approved_at IS NULL
  AND rejected_by IS NULL AND rejected_at IS NULL
  AND COALESCE(auto_approved, false) = false
  AND (submission_status IS NULL OR submission_status NOT IN ('approved','rejected'))
);

-- 3) profiles: remove it_manager from broad SELECT; IT managers access via
--    SECURITY DEFINER RPCs (get_profile_full, admin_list_profiles) that
--    already null out sensitive salary/contact fields for non-admins.
DROP POLICY IF EXISTS "Users read own or admin/it_manager read all" ON public.profiles;
CREATE POLICY "Users read own or admin reads all"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
