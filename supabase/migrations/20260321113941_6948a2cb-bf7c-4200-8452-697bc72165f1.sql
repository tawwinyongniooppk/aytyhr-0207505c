
ALTER TABLE public.attendance
  ADD COLUMN check_in_lat double precision,
  ADD COLUMN check_in_lng double precision,
  ADD COLUMN check_in_distance double precision;
