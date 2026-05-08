ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS work_schedule jsonb NOT NULL DEFAULT jsonb_build_object(
  'Monday',    jsonb_build_object('active', true,  'check_in', '09:00', 'check_out', '16:00'),
  'Tuesday',   jsonb_build_object('active', true,  'check_in', '09:00', 'check_out', '16:00'),
  'Wednesday', jsonb_build_object('active', true,  'check_in', '09:00', 'check_out', '16:00'),
  'Thursday',  jsonb_build_object('active', true,  'check_in', '09:00', 'check_out', '16:00'),
  'Friday',    jsonb_build_object('active', true,  'check_in', '09:00', 'check_out', '16:00'),
  'Saturday',  jsonb_build_object('active', false, 'check_in', '09:00', 'check_out', '16:00'),
  'Sunday',    jsonb_build_object('active', false, 'check_in', '09:00', 'check_out', '16:00')
);