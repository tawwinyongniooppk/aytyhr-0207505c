
CREATE OR REPLACE FUNCTION public.enforce_attendance_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_privileged boolean;
  school_lat double precision;
  school_lng double precision;
  allowed_radius double precision;
  dist double precision;
  earth_r constant double precision := 6371000;
  dlat double precision;
  dlng double precision;
  a double precision;
BEGIN
  -- Service role / system inserts bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admin / assistant bypass (they can manually adjust attendance)
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) INTO is_privileged;
  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Skip rows without coordinates (e.g. leave-only records); the app always sends
  -- coordinates on check-in. We only enforce when check_in_time is being set.
  IF NEW.check_in_time IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.check_in_lat IS NULL OR NEW.check_in_lng IS NULL THEN
    RAISE EXCEPTION 'Check-in requires location coordinates';
  END IF;

  SELECT value::double precision INTO school_lat   FROM public.app_settings WHERE key = 'school_latitude';
  SELECT value::double precision INTO school_lng   FROM public.app_settings WHERE key = 'school_longitude';
  SELECT value::double precision INTO allowed_radius FROM public.app_settings WHERE key = 'allowed_radius_meters';

  -- If geofence not configured, allow (don't block staff)
  IF school_lat IS NULL OR school_lng IS NULL OR allowed_radius IS NULL THEN
    RETURN NEW;
  END IF;

  -- Haversine
  dlat := radians(NEW.check_in_lat - school_lat);
  dlng := radians(NEW.check_in_lng - school_lng);
  a := sin(dlat/2)^2 + cos(radians(school_lat)) * cos(radians(NEW.check_in_lat)) * sin(dlng/2)^2;
  dist := 2 * earth_r * asin(sqrt(a));

  -- Store actual computed distance & status (overrides any client-supplied value)
  NEW.check_in_distance := dist;
  IF dist > allowed_radius THEN
    NEW.location_status := 'outside';
    RAISE EXCEPTION 'You are outside the allowed check-in area (%.0fm away, max %sm)', dist, allowed_radius;
  ELSE
    NEW.location_status := 'inside';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_attendance_geofence_trg ON public.attendance;
CREATE TRIGGER enforce_attendance_geofence_trg
BEFORE INSERT OR UPDATE OF check_in_time, check_in_lat, check_in_lng ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.enforce_attendance_geofence();
