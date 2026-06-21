## ၁။ Lesson Plans Template Editor Rework

### A. "Card" → "Table" rename
- `TemplateEditor.tsx` ထဲမှာ "Card 1, Card 2, Card 3" sidebar label နှင့် dialog/heading များကို **Table 1, Table 2, Table 3** အဖြစ် ပြောင်းမည်။
- Add Row / Delete Last Row / Add Column / Delete Last Column buttons အတိုင်း ထားမည်။

### B. Excel-style drag-resize (slider/% ဖျက်)
- ယခု `Slider` (Inner column widths %) နှင့် numeric row height inputs များကို ဖျက်မည်။
- `TemplateCanvas.tsx` (preview pane) ထဲမှာ — Excel ပုံစံ **drag handle** ထည့်မည်။
  - Column border ပေါ်တွင် mouse-down → ဘယ်/ညာ drag လုပ်လို့ column width ပြောင်းနိုင်မည် (px).
  - Row border ပေါ်တွင် mouse-down → အပေါ်/အောက် drag လုပ်လို့ row height ပြောင်းနိုင်မည် (px).
  - Drag အပြီး state ကို template JSON ထဲကို save (colWidths %, row.height px).
- **Margin guard**: total column widths သည် page content area (= page width − marginLeft − marginRight) ထက် မကျော်စေရ။ Row stack height သည် content height ထက် မကျော်စေရ — ကျော်လျှင် drag ကို clamp လုပ်မည်။

### C. Format tab rename + Add new format (Max 5 per class)
- ယခု hardcoded `["format1", "format2"]` ကို dynamic list အဖြစ် ပြောင်းမည်။
- Tab right-click သို့မဟုတ် double-click → **rename** (Excel sheet tab ပုံစံ).
- `+ Add Format` button (max 5 per class) — Format 3, 4, 5 ထပ်ထည့်နိုင်မည်။
- Tab name များကို DB column အသစ်တစ်ခုဖြင့် သိမ်းမည် (`display_name` text, default "Format N").

### D. Multi-page support per format
- Template JSON schema ထဲကို `pages: PageContent[]` array ထည့်မည် (backward compatible — `cards` ရှိရင် pages[0] အဖြစ် migrate).
- Page တစ်ခုစီတွင် မိမိ cards/freeElements/header reserve ရှိမည်။
- **Header reserve**: page top တွင် logo + headerText အတွက် နေရာချန်ထားမည် (`branding.headerReservePx`, default 120px) — cards များသည် ဒီအောက်ကမှ စမည်။
- Editor toolbar ထဲ **+ Add Page** button၊ Page tabs (Page 1, Page 2, …) navigation, page delete button။
- Beginner/Junior/Senior + IT Manager တိုင်းအတွက် အလုပ်လုပ်မည်။

### Files to edit
- `src/lib/lessonPlanTypes.ts` — `pages`, `headerReservePx`, format display_name types
- `src/lib/lessonPlanDefaults.ts` — pages[] migration, normalizeTemplate
- `src/pages/LessonPlansEditor.tsx` — dynamic formats, rename UI, +Add Format/Page
- `src/components/lesson-plans/TemplateEditor.tsx` — Table rename, page nav, drag-resize wiring, header reserve UI
- `src/components/lesson-plans/TemplateCanvas.tsx` — drag handles for col/row, margin clamping, header reserve rendering
- `src/pages/MyTimetablePage.tsx` — pages[] rendering for staff view (read-only)
- `src/lib/exportPdf.ts` — multi-page PDF export with header reserve
- DB migration — `lesson_plan_templates` table: add `display_name text`, schema doc only (template_json holds pages[]); no breaking change

---

## ၂။ Notification Audit Report

Project တစ်ခုလုံးကို scan လုပ်ပြီး FCM Push + In-App Notification ပို့သော နေရာအားလုံးကို ဖော်ထုတ်မည်။

Scan locations:
- `supabase/functions/*/index.ts` (edge functions — task-deadline-sweep, auto-checkout, auto-submit-missed-leave, monthly-reset, send-push, etc.)
- `src/**/*.{ts,tsx}` တွင် `sendPush`, `notifyAdmins`, `supabase.functions.invoke("send-push")`, in-app `toast({...})` notification trigger နှင့် `notifications` table writes
- DB triggers (`supabase--read_query` ဖြင့် pg_trigger စစ်မည်)

Output format (per notification):
| Field | Detail |
|---|---|
| Notification Name | … |
| Trigger Function/Event | … |
| Watched Table | … |
| Target Role(s) | Admin / Assistant / Staff / All |
| Title | … |
| Body | … |
| Image | Yes / No |
| FCM Used | Yes / No (In-App only) |
| Source File | path |
| Source Function | name |
| Flow | trigger → table → role |

**Delivery**:
1. Chat ထဲမှာ မြန်မာ summary + table
2. `/mnt/documents/NOTIFICATION_AUDIT.md` artifact (download/preview)

---

## အကောင်အထည်ဖော်မည့်အစီအစဉ်

1. DB migration (`display_name` column) → approval စောင့်
2. Type/Default updates (lessonPlanTypes, lessonPlanDefaults — backward-compatible normalize)
3. Editor UI rework (LessonPlansEditor, TemplateEditor, TemplateCanvas)
4. Staff view + PDF export update
5. Project-wide notification scan → audit report write
6. မြန်မာဘာသာဖြင့် Report

မိမိ logic များ (attendance, salary, leave, tasks) ကို မထိစေပါ — Lesson Plans editor + audit report သာ။