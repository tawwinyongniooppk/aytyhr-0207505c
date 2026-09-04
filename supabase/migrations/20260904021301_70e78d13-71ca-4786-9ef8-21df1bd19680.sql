ALTER POLICY "Read own or admin/it_manager" ON public.bonus_transactions TO authenticated;
ALTER POLICY "Read own salary or admin or it manager" ON public.salaries TO authenticated;
ALTER POLICY "Read own or admin/it_manager sma" ON public.salary_manual_additions TO authenticated;
ALTER POLICY "Read own or admin/it_manager smd" ON public.salary_manual_deductions TO authenticated;
ALTER POLICY "Admin and assistant can update profiles" ON public.profiles TO authenticated;
ALTER POLICY "IT Manager can update profiles" ON public.profiles TO authenticated;