
GRANT EXECUTE ON FUNCTION public.update_staff_attendance_settings(uuid, date, text, text, text, jsonb) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.apply_leave_balance_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_manual_deduction_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_unpaid_leave_salary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_attendance_late_minutes_on_insert() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_attendance_geofence() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_leave_request_submission() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.force_leave_request_insert_defaults() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.force_overtime_insert_defaults() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_attendance_protected_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_event_assignment_protected_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_leave_request_protected_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_overtime_protected_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_profile_base_salary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_profile_full_name_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_profile_it_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_profile_personal_contact_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_profile_role_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_profile_self_edit_allowlist() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_salary_financial_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_task_assignment_overlap() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guard_task_protected_fields() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_duplicate_task_assignment() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_checkin_on_morning_half_leave() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_profile_bonus_amount() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_refresh_auto_checkout_from_profile() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_refresh_auto_checkout_from_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.is_privileged_user() TO authenticated, service_role;
