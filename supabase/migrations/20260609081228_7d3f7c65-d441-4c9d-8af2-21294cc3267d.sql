
DROP POLICY IF EXISTS "Admin assistant can insert salaries" ON public.salaries;
DROP POLICY IF EXISTS "Admin assistant can update salaries" ON public.salaries;

CREATE POLICY "Admin can insert salaries" ON public.salaries
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admin can update salaries" ON public.salaries
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
