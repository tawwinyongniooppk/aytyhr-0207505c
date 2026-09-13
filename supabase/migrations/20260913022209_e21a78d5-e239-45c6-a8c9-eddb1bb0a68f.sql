REVOKE EXECUTE ON FUNCTION public.get_overtime_financials() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_overtime_financials() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_overtime_financials() TO authenticated;