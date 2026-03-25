CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/assistant can insert tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tasks" ON public.tasks FOR UPDATE TO authenticated USING (true);