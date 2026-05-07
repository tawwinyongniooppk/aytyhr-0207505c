
-- Re-broaden SELECT on profiles to keep name lookups working
DROP POLICY IF EXISTS "Read own or privileged profiles" ON public.profiles;

CREATE POLICY "Authenticated can read profiles non-sensitive"
ON public.profiles FOR SELECT TO authenticated
USING (true);

-- Hide sensitive columns at the column-grant level
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, role, created_at, join_date, work_day, check_in_time, check_out_time)
  ON public.profiles TO authenticated;

-- Privileged RPC to read full profile (including phone + base_salary)
CREATE OR REPLACE FUNCTION public.get_profile_full(p_id uuid)
RETURNS SETOF public.profiles
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant','it_manager')) THEN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_profile_full(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_full(uuid) TO authenticated;
