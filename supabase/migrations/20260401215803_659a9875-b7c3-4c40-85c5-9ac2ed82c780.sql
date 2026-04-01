
-- Calendar events table
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'event',
  visibility TEXT NOT NULL DEFAULT 'public',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Event assignments table (for private events)
CREATE TABLE public.calendar_event_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  UNIQUE(event_id, user_id)
);

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_assignments ENABLE ROW LEVEL SECURITY;

-- Calendar events: anyone authenticated can read public events or events assigned to them
CREATE POLICY "Users can read visible events" ON public.calendar_events
  FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.calendar_event_assignments
      WHERE calendar_event_assignments.event_id = calendar_events.id
      AND calendar_event_assignments.user_id = auth.uid()
    )
  );

-- Only admin/assistant can insert events
CREATE POLICY "Admin/assistant can create events" ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

-- Only admin/assistant can update events
CREATE POLICY "Admin/assistant can update events" ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

-- Only admin/assistant can delete events
CREATE POLICY "Admin/assistant can delete events" ON public.calendar_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

-- Assignments: readable by authenticated
CREATE POLICY "Authenticated can read assignments" ON public.calendar_event_assignments
  FOR SELECT TO authenticated
  USING (true);

-- Assignments: admin/assistant can insert
CREATE POLICY "Admin/assistant can insert assignments" ON public.calendar_event_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );

-- Assignments: admin/assistant can delete
CREATE POLICY "Admin/assistant can delete assignments" ON public.calendar_event_assignments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'assistant')
    )
  );
