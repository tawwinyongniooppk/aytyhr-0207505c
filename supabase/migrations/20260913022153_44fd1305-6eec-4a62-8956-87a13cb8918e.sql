-- 1) Storage: restrict storage.objects SELECT (listing) to signed-in users.
-- Public bucket URLs continue to work; this only stops anonymous API listing.
DROP POLICY IF EXISTS "Avatars read public" ON storage.objects;
CREATE POLICY "Avatars read public" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Branding read public" ON storage.objects;
CREATE POLICY "Branding read public" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Lesson plan assets are publicly readable" ON storage.objects;
CREATE POLICY "Lesson plan assets are publicly readable" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'lesson-plan-assets');

-- 2) Manual salary additions/deductions: remove it_manager from privileged read
DROP POLICY IF EXISTS "Read own or admin/it_manager sma" ON public.salary_manual_additions;
CREATE POLICY "Read own or admin sma" ON public.salary_manual_additions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Read own or admin/it_manager smd" ON public.salary_manual_deductions;
CREATE POLICY "Read own or admin smd" ON public.salary_manual_deductions FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 3) Overtime financial columns: remove table-level SELECT, grant non-financial
-- columns to everyone signed in, and give admin/assistant a secure RPC for the
-- amount and rate fields.
REVOKE SELECT ON public.overtime_requests FROM authenticated;
GRANT SELECT (id, user_id, title, description, reason, start_at, end_at, minutes, status, reviewed_by, reviewed_at, created_at) ON public.overtime_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.get_overtime_financials()
 RETURNS TABLE(id uuid, user_id uuid, amount integer, rate_per_minute integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','assistant')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT o.id, o.user_id, o.amount, o.rate_per_minute FROM public.overtime_requests o;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_overtime_financials() TO authenticated;