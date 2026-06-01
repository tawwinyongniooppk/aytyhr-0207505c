## Goal
Mirror the existing Morning Half-Leave / auto-Full-Leave logic for the Afternoon Half-Leave flow, link Half-Leave with check-in, enforce monthly leave caps (Full ≤2, Half ≤4), and lock financial approvals to Admin only (Assistant Admin sees but cannot approve).

## 1) Afternoon Half-Leave (Admin-only approval)

**Submission**
- Staff/Assistant can submit `half_leave` with `half_period = 'afternoon'`.
- On insert → FCM push (sound + badge) to all Admin + Assistant Admin: "Afternoon Half-Leave request submitted by {name}".

**Approval (Admin only, requires Manual Deduction)**
- In `src/pages/Leave.tsx`, when the request is `half_leave` (morning OR afternoon), require the Admin to enter Description + Amount before Approve becomes enabled. Same UI block already used for over-cap Full Leave.
- On Approve:
  - Insert `salary_manual_deductions` row (title = description, amount, source = `'half_leave'`).
  - Update `leave_requests` status = approved → existing `apply_leave_balance_change` trigger already deducts 0.5 from `leave_balances`. The user's "လက်ကျန် 9.5/8.5..." info reads from the same balance, so it updates automatically.
  - FCM push to the staff: "Half-Leave approved. Manual Deduction {amount} Ks — {description}".
  - For Afternoon Half-Leave specifically: also broadcast a "Check-out time shifted to 12:00 PM" notification to Admin + Assistant Admin + the Staff.

**Attendance side (Afternoon Half-Leave shifts check-out)**
- Mirror existing Morning Half-Leave check-in override in `src/pages/Attendance.tsx`: when there is an approved `half_leave` with `half_period='afternoon'` for today, the expected **check-out** time becomes **12:00 MMT** (check-in stays at the admin-set time).
- `apply-attendance-deduction` edge function: when computing `early_minutes` for the day, if afternoon half-leave is approved, treat expected check-out as `12:00`.

## 2) Auto early-leave deduction (+30 min past check-out)

- New behavior in `auto-submit-missed-leave` (rename concept to a single "attendance-sweep" job): if a staff has checked in but has **not** checked out by `expected_check_out + 30min` (where expected respects the Afternoon Half-Leave 12:00 override), apply a one-time **1000 Ks** deduction (5 min × `early_deduction_per_minute` 200) via `salary_manual_deductions` with source = `'auto_early_out'` and title = `Auto early-out deduction`.
- Idempotency: skip if a row with `source='auto_early_out'` already exists for that user+date. Also mark `attendance.deduction_applied = true` (or a new flag) so we never re-charge.
- FCM push to that staff: "Check-out မလုပ်ခဲ့သဖြင့် 1,000 Ks Auto Deduction ဖြတ်ထားပါသည်။".

## 3) Half-Leave linked with check-in (+30 min late ⇒ auto Half-Leave request)

- Same sweep job: for each user, if no check-in by `expected_check_in + 30min` AND no morning half-leave already approved AND no auto request yet today → insert a `half_leave` request with `half_period='morning'`, `status='pending'`, `payment_type='unpaid'`, `reason='[AUTO] Late check-in (+30min) — auto Half-Leave'`.
- Existing 2hr Full-Leave auto-escalation stays as a second tier (still triggers if user never shows up).
- Idempotency: one auto half-leave per user per day (detected by `[AUTO]` prefix + type='half_leave').
- FCM push to Admin + Assistant Admin + Staff.

The pg_cron job already calls this function every 5 min; we just expand its body — no new schedule needed.

## 4) Monthly caps (server-enforced)

Update `public.enforce_leave_request_submission()` trigger:
- Currently caps to 2 days equivalent (full=1, half=0.5).
- New rule: count by **type** instead.
  - `type='leave'`: max 2 non-rejected per month.
  - `type='half_leave'`: max 4 non-rejected per month (regardless of morning/afternoon).
- Same `MONTHLY_LIMIT` error code so the existing UI catches it.
- Also update `src/pages/Leave.tsx` client-side pre-check messages.

## 5) Assistant Admin = view-only for financial requests

In `src/pages/Leave.tsx`:
- For rows of type `half_leave` and for over-cap `leave` requests (anything needing Manual Deduction), if `useProfile().isAssistant` is true: hide Approve / Reject buttons; show a read-only badge ("Admin approval required" / "Approved by Admin" / "Rejected by Admin").
- Assistant can still see status + reviewer name once Admin acts.

## 6) Files / migrations

- **Migration** `enforce_leave_request_submission`: change cap logic to per-type (2 full, 4 half).
- **Edge function** `auto-submit-missed-leave/index.ts`: add the +30-min half-leave auto-request branch and the +30-min auto early-out 1,000 Ks deduction branch.
- **`src/pages/Leave.tsx`**: notifications on afternoon submit, require manual deduction for any half_leave approval, assistant view-only, updated cap labels.
- **`src/pages/Attendance.tsx`**: afternoon half-leave shifts expected check-out to 12:00.
- **`supabase/functions/apply-attendance-deduction/index.ts`**: respect afternoon half-leave override for early_minutes.

## Notes
- "အခါခါ Query မတက်ရ": the sweep is the single cron-driven job (existing 5-min schedule); pages do not poll for these conditions. UI just reads notifications + the leave/salary rows that are already loaded.
- No new tables. Reuses `salary_manual_deductions`, `leave_requests`, `leave_balances`, `attendance`.