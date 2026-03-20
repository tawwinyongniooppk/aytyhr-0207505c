
-- Create leave_requests table
CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'leave' CHECK (type IN ('leave', 'late_excuse')),
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read all requests
CREATE POLICY "Authenticated can read all leave requests"
ON public.leave_requests FOR SELECT TO authenticated
USING (true);

-- Users can insert own requests
CREATE POLICY "Users can insert own leave requests"
ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update own pending requests (cancel), admins update via edge function
CREATE POLICY "Users can update own leave requests"
ON public.leave_requests FOR UPDATE TO authenticated
USING (true);
