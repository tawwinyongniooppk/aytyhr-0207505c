
-- Attach existing guard functions as triggers (they were defined but never wired up).

-- profiles guards
DROP TRIGGER IF EXISTS trg_guard_profile_role_change ON public.profiles;
CREATE TRIGGER trg_guard_profile_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();

DROP TRIGGER IF EXISTS trg_guard_profile_full_name_change ON public.profiles;
CREATE TRIGGER trg_guard_profile_full_name_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_full_name_change();

DROP TRIGGER IF EXISTS trg_guard_profile_it_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_it_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_it_fields();

DROP TRIGGER IF EXISTS trg_guard_profile_base_salary ON public.profiles;
CREATE TRIGGER trg_guard_profile_base_salary
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_base_salary();

-- new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- attendance guard
DROP TRIGGER IF EXISTS trg_guard_attendance_protected_fields ON public.attendance;
CREATE TRIGGER trg_guard_attendance_protected_fields
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_protected_fields();

-- salaries guard
DROP TRIGGER IF EXISTS trg_guard_salary_financial_fields ON public.salaries;
CREATE TRIGGER trg_guard_salary_financial_fields
  BEFORE INSERT OR UPDATE ON public.salaries
  FOR EACH ROW EXECUTE FUNCTION public.guard_salary_financial_fields();

-- leave request guards & logic
DROP TRIGGER IF EXISTS trg_guard_leave_request_protected_fields ON public.leave_requests;
CREATE TRIGGER trg_guard_leave_request_protected_fields
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_leave_request_protected_fields();

DROP TRIGGER IF EXISTS trg_apply_leave_balance_change ON public.leave_requests;
CREATE TRIGGER trg_apply_leave_balance_change
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance_change();

DROP TRIGGER IF EXISTS trg_apply_unpaid_leave_salary ON public.leave_requests;
CREATE TRIGGER trg_apply_unpaid_leave_salary
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_unpaid_leave_salary();

-- leave_manual_deductions
DROP TRIGGER IF EXISTS trg_apply_manual_deduction_change ON public.leave_manual_deductions;
CREATE TRIGGER trg_apply_manual_deduction_change
  AFTER INSERT OR DELETE ON public.leave_manual_deductions
  FOR EACH ROW EXECUTE FUNCTION public.apply_manual_deduction_change();

-- tasks & event assignment guards
DROP TRIGGER IF EXISTS trg_guard_task_protected_fields ON public.tasks;
CREATE TRIGGER trg_guard_task_protected_fields
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_protected_fields();

DROP TRIGGER IF EXISTS trg_guard_event_assignment_protected_fields ON public.calendar_event_assignments;
CREATE TRIGGER trg_guard_event_assignment_protected_fields
  BEFORE UPDATE ON public.calendar_event_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_event_assignment_protected_fields();
