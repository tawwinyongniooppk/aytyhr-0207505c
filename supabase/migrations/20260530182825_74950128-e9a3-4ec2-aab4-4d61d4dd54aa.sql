-- Revoke anon access to profile-listing RPCs
REVOKE EXECUTE ON FUNCTION public.list_public_profiles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_profile_full(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_public_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

-- Add in-function guard against unauthenticated callers
CREATE OR REPLACE FUNCTION public.list_public_profiles()
 RETURNS TABLE(id uuid, full_name text, role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT p.id, p.full_name, p.role FROM public.profiles p;
END;
$function$;