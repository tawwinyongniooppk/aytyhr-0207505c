
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  banner_url text,
  icon_key text NOT NULL DEFAULT 'default',
  layout text NOT NULL DEFAULT 'minimal' CHECK (layout IN ('minimal','compact','image_focused')),
  action_type text NOT NULL DEFAULT 'none' CHECK (action_type IN ('none','internal','external')),
  action_target text,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','admins','staff','it_managers','specific')),
  audience_user_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sent','failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  last_error text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "IT Manager can select notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.is_it_manager());

CREATE POLICY "IT Manager can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_it_manager() AND created_by = auth.uid());

CREATE POLICY "IT Manager can update notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (public.is_it_manager())
  WITH CHECK (public.is_it_manager());

CREATE POLICY "IT Manager can delete notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (public.is_it_manager());

CREATE OR REPLACE FUNCTION public.notifications_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_touch_updated_at();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
