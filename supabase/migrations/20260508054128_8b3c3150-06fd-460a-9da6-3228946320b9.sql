GRANT EXECUTE ON FUNCTION public.get_profile_full(uuid) TO anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_profiles() TO anon, authenticated, PUBLIC;