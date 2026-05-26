# Task Management Overhaul Plan

## Goals
Rework Task Management around a **monthly 4-Unit quota per staff**, with a strict status flow, deadline-driven (non-recurring) auto-approve, bonus-splitting tied to unit completion, and monthly auto-reset of salary/bonus logs.

---

## 1. Data Model Changes (Migration)

### `tasks` table — add columns
- `unit_count` int NOT NULL DEFAULT 1 — 1 = weekly task, 2 = bi-weekly task
- `acknowledged_at` timestamptz NULL — set when staff clicks "I understand, I will do it"
- `auto_approved` boolean NOT NULL DEFAULT false
- `bonus_amount` int NOT NULL DEFAULT 0 — slice of monthly bonus tied to this task
- `overdue` boolean NOT NULL DEFAULT false

### Status flow (`submission_status`)
`new` → `in_progress` (after acknowledge) → `submitted` (after staff submit) → `approved` | `rejected` | `overdue`

### `salaries` table — bonus split tracking
Add helper table `bonus_transactions`:
- `user_id`, `task_id`, `month`, `amount`, `deadline_date`, `approved_date`, `created_at`
- RLS: staff read own; admin read all; admin/assistant insert.

### Constraint enforcement
Trigger on `tasks` INSERT: count current-month units for assignee, reject if `existing_units + unit_count > 4`.

---

## 2. Status Flow Rules

| From | To | Trigger |
|------|----|---------|
| new | in_progress | Staff acknowledges |
| in_progress | submitted | Staff submits |
| submitted | approved | Admin approves OR auto-approve at deadline |
| submitted | rejected | Admin rejects → back to in_progress, no unit completion |
| in_progress / new | overdue | Deadline passed without submit |

Approving (manual or auto) inserts the task's `bonus_amount` into `bonus_transactions` and updates current month's `salaries.bonus`.

---

## 3. Bonus Splitting

When admin sets monthly bonus for staff on Salaries page:
- Read assignee's tasks for the month, sum `unit_count` (cap at 4)
- Split bonus equally per unit: `per_unit = bonus / 4`
- Update each task's `bonus_amount = per_unit * unit_count`
- Only approved (or auto-approved) units actually credit the bonus transaction.

---

## 4. Auto-Approve & Overdue (No Recurring Cron)

Replace any 5-minute cron with a **single daily cron at end-of-day Yangon time (23:55 MMT = 17:25 UTC)**:
- Find tasks with `due_date = today` and status = `submitted` → auto-approve, set `auto_approved=true`, insert bonus transaction.
- Find tasks with `due_date < today` and status IN (`new`, `in_progress`) → mark `overdue=true`, status='overdue'.

Edge function: `task-deadline-sweep` (new).

---

## 5. Monthly Reset (MMT 23:59 last day)

Cron at `55 17 28-31 * *` UTC, function checks `tomorrow_yangon.day == 1`, then:
- Delete current-month rows from `salaries`, `bonus_transactions`, `leave_manual_deductions`
- Reset task logs older than today (extend existing `purge_old_*` functions)

Edge function: `monthly-reset` (new).

---

## 6. UI Changes

### `Tasks.tsx` / `StaffTaskView.tsx`
- New tab structure: **New (4 max) | In Progress | Submitted | Overdue | Done**
- Badge count capped at 4
- Staff view: each "new" task shows **"I understand, I will do it"** button → transitions to in_progress
- Submitted card shows "Awaiting approval"

### `AdminTaskDashboard.tsx`
- When creating task from Calendar: prompt for **Unit (1 = weekly, 2 = bi-weekly)**, validate ≤ remaining units
- Show per-staff `usedUnits / 4` indicator
- Submitted tab: Approve / Reject buttons

### `SalariesAndBonuses.tsx`
- Bonus input shows split preview: `Bonus ÷ 4 per unit × completed units = payable`
- Bonus Transactions table with `Deadline Date | Approved Date | Amount`

### `SalaryPage.tsx` (staff)
- Bonus transactions list with deadline & approve dates

---

## 7. Files to Change

**New**
- `supabase/functions/task-deadline-sweep/index.ts`
- `supabase/functions/monthly-reset/index.ts`
- Migration: schema + cron schedules

**Edit**
- `src/pages/Tasks.tsx` — quota check, new status flow
- `src/components/tasks/StaffTaskView.tsx` — acknowledge button, new tabs, badge cap
- `src/components/tasks/AdminTaskDashboard.tsx` — unit picker, quota indicator, reject flow
- `src/pages/SalariesAndBonuses.tsx` — bonus split UI + transactions
- `src/pages/SalaryPage.tsx` — bonus transactions for staff
- `src/pages/CalendarPage.tsx` — pass unit_count when creating task events

**Unschedule**
- Any prior recurring `auto-approve*` or `*-every-5-min` jobs related to tasks

---

## Open Questions
1. If a bi-weekly (2-unit) task overruns and only 1 week was acknowledged, do we still pay 2 units' bonus on approve? **Assumption:** yes, bonus tracks `unit_count`, not duration.
2. If admin changes monthly bonus after some tasks already approved, do we re-bill past `bonus_transactions`? **Assumption:** only future approvals use the new per-unit amount; existing transactions are immutable.
3. Bonus split — divide by **fixed 4** every month, or by actual `unit_count` assigned that month? Spec says "4 ပုံခွဲ" → **fixed /4**.

Confirm these assumptions or adjust before I build.
