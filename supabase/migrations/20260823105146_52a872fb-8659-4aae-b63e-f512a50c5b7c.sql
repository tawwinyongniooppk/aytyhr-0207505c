
UPDATE public.notifications SET status = 'draft' WHERE status = 'scheduled';
ALTER TABLE public.notifications DROP COLUMN IF EXISTS scheduled_at;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'failed'::text]));
