
## Root cause (why တီချယ်မွန် / တီချယ်သင်း က Deadline မရောက်ခင် All Done ဖြစ်နေသလဲ)

`supabase/functions/auto-weekly-task-credit/index.ts` က **checkpoint window (Week 2 = Day 4–10)** ထဲမှာ assignment ရှိ/မရှိပဲ စစ်တယ်။

- တီချယ်မွန် / တီချယ်သင်း တို့မှာ **biweekly task "IEP format" [2026‑06‑02 → 2026‑06‑14]** ရှိနေတယ်။ စတင်ရက် `06‑02` က Week 1 (Day 1–3) window အပြင်က ဖြစ်နေလို့ Week 2 sweep က "missing" လို့ ထင်ပြီး auto‑approved assignment + 2,500 MMK bonus row ထည့်ပေးခဲ့တယ်။
- ဒါကြောင့် သူတို့ရဲ့ **deadline 06‑14 မရောက်ခင်** Week 2 credit တစ်ခု ပိုသွားပြီး လကုန် 5 unit / cap 4 ဖြစ်လာနိုင်တယ်။
- Manual `handleApprove` (AdminTaskDashboard) ကလည်း deadline မရောက်ခင် approve လုပ်တာနဲ့ bonus row ချက်ချင်း ထည့်လိုက်တယ် — "submit/approve early but credit only at deadline" rule နဲ့ မကိုက်ဘူး။

## Fix Plan

### 1. `auto-weekly-task-credit` ကို deadline‑aware ပြန်ရေး
ဖိုင်: `supabase/functions/auto-weekly-task-credit/index.ts`

- Window တွင်း assignment ရှိ/မရှိ စစ်တာအစား, **staff တစ်ယောက်ချင်းအတွက် "active commitment"** ရှိမရှိ စစ်မယ်။ Active commitment = `calendar_events` (event_type='task') တစ်ခုခု ရှိပြီး `start_date <= window.end` **AND** `end_date >= window.end` (i.e. deadline က ဒီ checkpoint ထက် နောက်/တူ).
- အဲဒီ active commitment ရှိရင် ထို staff ကို **skip** — biweekly task က Week 1 မှာ စပြီး Week 2 checkpoint မှာ မပြီးသေးတာ ဖြစ်လို့။
- `tasks` table မှာလည်း `due_date >= window.end` ရှိရင် skip။
- "Missing" = (a) window တွင်း OR (b) ဒီ checkpoint အပြီးထိ active deadline လုံးဝ မရှိသူ ပဲ။ ထို staff အတွက်သာ 1 unit auto‑credit ပေး။
- Bonus row မှာ `deadline_date = win.end` ဆက်သုံး၊ `unit_count = 1`၊ `Math.round(monthlyBonus/4)` ဆက်သုံး (rule မပြောင်း)။

### 2. `task-deadline-sweep` ကို "single source of truth" အဖြစ် ပြုပြင်
ဖိုင်: `supabase/functions/task-deadline-sweep/index.ts`

ပြောင်းရမည့်အချက်များ — daily 23:55 MMT run တိုင်းမှာ:
- **(A) Tasks** — `due_date = today` **AND** `submission_status = 'submitted'` ဆိုသူကိုသာ approve + credit (လက်ရှိအတိုင်း ထား)။
- **(B) Calendar assignments** — `event.end_date = today` **AND** assignment status `submitted` ဆိုသူကိုသာ approve + credit (လက်ရှိ behavior မှန်)။
- **(C/D) Overdue** — deadline ကျော်လို့ `not_started/in_progress/not_submitted/rejected` ဖြစ်နေသူကို `overdue` + 0 MMK row (လက်ရှိအတိုင်း)။
- **အသစ်ထည့်ရန် (F): Early‑approved deferred credit** — `tasks.submission_status = 'approved'` **AND** `due_date = today` **AND** ထို `task_id` အတွက် `bonus_transactions` row မရှိသေး → credit row ထည့်ပေး။ Calendar assignments မှာလည်း `assignment_id` ပြန်စစ်ပြီး တူညီသော deferred‑credit logic ထည့်။
- (E) End‑of‑window auto all‑done — biweekly task ရ