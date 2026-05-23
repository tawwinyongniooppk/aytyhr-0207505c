## Goals

1. Stop showing the "off day / holiday" greeting on Attendance when Admin/Assistant has not actually marked the day off.
2. Fix `Check-out failed — You can only update your own check-out field` when checking out early.
3. If a user has not checked in by **exactly +2 hours past their expected check-in**, auto-submit a Full Leave request to Admin/Assistant (server-side, once per day per user).
4. If a user has not checked out by **exactly +30 minutes past their expected check-out**, auto-deduct **5 minutes × per-minute rate** (= 1000 Ks at 200/min) — currently it deducts 10 min. Also enforce "once per day" eligibility.
5. Keep DB load minimal: server cron processes each user at most once per day, only after the exact thresholds.

---

## 1. Holiday / off-day greeting bug (`src/pages/Attendance.tsx`)

Today's greeting picks the "off / leave" branch when `!isWorkingDay || isHolidayToday || hasFullLeaveToday`.

Issues to fix:
- `loadHolidayAndLeave()` treats any `calendar_events` row with `event_type='holiday'` as a holiday for the user if `assigned_to_all=true`, **even when admins did not actually publish a real holiday for that staff**. Fix: only count holidays the user is explicitly assigned to **or** explicitly `assigned_to_all=true` **and** the user is not the creator's private event. (Already structurally fine — real bug is below.)
- `isWorkingDay` falls back to `true` only when `todaySchedule` is null. But the default `work_schedule` JSON marks Sat/Sun as `active:false`, so every staffer on Sat/Sun sees the off-day text even though admin never customised it. Fix: when the staff has the **default** schedule (no admin customisation), fall back to the global `app_settings` rule instead of treating Sat/Sun as off automatically. Concretely, treat the day as working unless **either** (a) admin explicitly toggled the day off in this profile (compare against default), **or** (b) a holiday calendar event covers today and is assigned to this user, **or** (c) the user has an approved full-day leave.
- Re-render the greeting using the corrected `isWorkingDay`.

## 2. Early check-out RLS error

`handleCheckOut` does:
```ts
.update({ check_out_time: ..., early_minutes: earlyMin })
```
`guard_attendance_protected_fields` blocks non-admins from updating `early_minutes`, so the row update fails for staff doing an early check-out.

Fix: the client should only update `check_out_time`. `early_minutes` and the deduction are already computed server-side by the `apply-attendance-deduction` edge function. Remove `early_minutes` from the client update payload.

## 3. Auto Full-Leave submission (+2 h after expected check-in)

New edge function `auto-submit-missed-leave` (service role):
- Loads today's profiles with their effective `expected_check_in_time` (work_schedule[today] or legacy or settings default).
- For each user where `now >= expected_check_in + 2h`, **and** no attendance row for today, **and** no existing leave_request for today with `reason='[AUTO] Missed check-in'`: insert
  ```
  leave_requests(user_id, date=today, type='leave', status='pending', payment_type='unpaid',
                 reason='[AUTO] Missed check-in — auto-submitted by system')
  ```
  This routes through existing Admin/Assistant approval flow.
- Skips users where today is an off-day (their `work_schedule[today].active=false`), or a holiday assigned to them, or who already have any approved leave for today.

Scheduling: extend the existing `auto-checkout-every-5-min` cron (already invokes auto-checkout) to also call this new endpoint. Idempotency guard inside the function (`reason='[AUTO] Missed check-in'` uniqueness per user/date) ensures at most one submission per user per day, so the cron can run frequently without extra DB writes.

## 4. Auto-checkout tuning

Update `supabase/functions/auto-checkout/index.ts`:
- Change `PENALTY_MINUTES` from 10 → **5**.
- Already runs once per row because `deduction_applied` is set to true after processing — confirms "once per day per user".
- Replace the existing `*/5 * * * *` cron with one that still fires frequently but only acts when due (current logic already only processes rows past the 30-min grace) — keep cron at `*/5 * * * *` so the +30-min window is hit precisely; per-user it still runs at most once because of the `deduction_applied` flag.

## 5. Cron consolidation

Add one new cron job to invoke `auto-submit-missed-leave` every 5 minutes (same cadence as auto-checkout). Both functions are guarded by per-row idempotency flags so they run at most once per user per day.

---

## Technical notes

### Files changed
- `src/pages/Attendance.tsx` — fix off-day greeting logic; remove `early_minutes` from client check-out update.
- `supabase/functions/auto-checkout/index.ts` — `PENALTY_MINUTES = 5`.
- `supabase/functions/auto-submit-missed-leave/index.ts` — new edge function.
- Insert new `cron.schedule(...)` row invoking the new function every 5 minutes.

### Why no DB schema change
- The "auto leave already created" check uses `leave_requests.reason LIKE '[AUTO]%'` filtered by `user_id + date`, no new column needed.
- The "auto checkout already applied" check reuses existing `attendance.deduction_applied`.

### RLS / security
- Both edge functions use `SUPABASE_SERVICE_ROLE_KEY`, bypassing RLS safely. No client-side RLS changes required.
