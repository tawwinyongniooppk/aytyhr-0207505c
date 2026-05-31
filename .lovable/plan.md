# Lesson Plans Template Editor

## Goals
- IT Manager က Beginner / Junior / Senior class သုံးခုအတွက် lesson plan template (1 section, 3 cards) ကို Excel/Word-like UI နဲ့ ပြင်နိုင်ဖို့။
- Staff က မိမိ class နဲ့ ကိုက်ညီတဲ့ template ကို My Timetable & Lesson Plans မှာ မြင်ပြီး cell တွေထဲ စာဖြည့်၊ PDF export/Download (+ optional Gmail compose) လုပ်နိုင်ဖို့။
- Staff ဖြည့်တဲ့ data ကို database ထဲ **လုံးဝ မသိမ်း** — usage တက်စေနိုင်တဲ့ query/storage/API ဘာမှ မပါစေရ။ Template data သာ DB မှာ ရှိ။

## Scope of storage (Lovable Cloud usage)
- DB write/read က IT Manager template save/load time မှာသာ ဖြစ်မယ်။ Class သုံးခုဆို row သုံးခုသာ။
- Staff side: read template once on page load → ပြီးရင် client-only။ No realtime, no inserts, no logs.

## Data Model
New table `lesson_plan_templates`:
- `id` uuid PK
- `class` text unique — `'Beginner' | 'Junior' | 'Senior'`
- `template_json` jsonb — full editor document (layout, cards, cells, locked content, styles)
- `updated_by` uuid, `updated_at` timestamptz

RLS:
- SELECT: any authenticated user (staff needs to render their class template).
- INSERT/UPDATE: only `it_manager` role.
- DELETE: none.

GRANTs: `authenticated` (SELECT, INSERT, UPDATE), `service_role` ALL.

## Template JSON shape
```
{
  page: { size: 'A4'|'Legal', orientation: 'portrait'|'landscape', margins: {...} },
  branding: { logoUrl, headerText, watermark: { url, text, opacity } },
  palette: 'palette1'..'palette6',
  border: { size, style, color },
  letterheadFooterText: string,
  cards: [Card, Card, Card]   // exactly 3 cards in 1 section
}
Card = {
  title, bgColor, borderColor,
  rows: [
    { cells: [{ id, locked, value, fontFamily, fontSize, color, bgColor, align, minFontSize: 12 }] }
  ]
}
```
Locked cells = IT Manager content (read-only for staff). Unlocked cells = staff editable.

## IT Manager — Lesson Plans Template Editor page
- New route `/lesson-plans-editor` (IT Manager only).
- Sidebar entry “Lesson Plans Templates” added to IT Manager nav.
- Tabs: **Beginner / Junior / Senior** — each is a full template editor for that class.
- Editor capabilities (per cell + global):
  - School logo + header text placement, watermark image/text + opacity slider.
  - 6 curated premium color palettes (switch).
  - Border size/shape/color, letterhead footer text.
  - Font family, font size, font color, cell background color, text align.
  - Page size A4 / Legal, orientation portrait / landscape.
  - Lock toggle per cell (locked content cannot be edited by staff).
  - Add/remove rows per card; 3 cards fixed per class.
- Live preview pane shows the page bounded by the chosen paper size.
- Save button → upserts the row for that class.

### Editor library
Use **Handsontable Community** (`handsontable` MIT) for the spreadsheet feel:
- Per-cell read-only flag, per-cell renderer for font/size/color/bg, merge cells, alt-enter newline, word-wrap with auto row-height growth.
- No external connector needed → no Lovable usage hit on the staff side.

(If Handsontable license footprint is a concern we fall back to a thin custom TanStack-Table + `contentEditable` grid; same JSON contract.)

## Staff — My Timetable & Lesson Plans
- On mount: `select template_json from lesson_plan_templates where class = profile.class` (1 row, cached in React state). No further DB I/O.
- Render the template inside an A4/Legal-sized container at CSS print scale.
- Locked cells render as plain styled text. Unlocked cells become inputs with:
  - Alt+Enter / Enter → newline within cell (textarea behavior).
  - Word-wrap; cell auto-grows **downward**; cells below shift down (paginated).
  - **Width is fixed** to template column width — never overflows horizontally.
  - Min font size 12 enforced; if IT Manager pinned font/size on that cell, staff input inherits it and cannot change it.
- Pagination: a Page component splits content when vertical overflow detected and starts a new A4/Legal page below. Horizontal bounds are hard-locked.

### Action bar
Three actions at top of the lesson plan page:
1. **Export & Download (PDF)** — always shown.
2. **Export, Download & Report to Admin** — shown only when device supports opening Gmail compose. Detection:
   - Hide on iOS Safari (UA check: iOS && Safari && not Chrome/Edge).
   - Show on Chrome/Edge desktop & Android.

### Export flow
- Render visible pages → `html2canvas` per page → `jsPDF` multi-page PDF → `saveAs(blob, 'LessonPlan_<class>_<date>.pdf')` (uses `file-saver`).
- “Report to Admin” variant: after download triggers, open
  `https://mail.google.com/mail/?view=cm&fs=1&to=<admin@ayty.com>&su=Lesson Plan – <staff name> – <date>&body=...`
  in a new tab. User attaches the just-downloaded file manually (browsers cannot pre-attach for security).
- Immediately after either action, show modal:
  - **အဆင်ပြေတယ်** → clear all unlocked cell values in state (template format intact, no DB write).
  - **အဆင်မပြေဘူး** → close modal, return to editing.

### iOS Safari
- Only “Export & Download” is shown; same post-export confirm modal.

## Navigation & Roles
- `DesktopSidebar` + `BottomNav`: add “Lesson Plans Templates” item gated to `isItManager`.
- `AppLayout` allow-list updated so `/lesson-plans-editor` is reachable only by IT Manager (other roles → redirect).

## Dependencies to add
- `handsontable` (editor grid)
- `jspdf`, `html2canvas`, `file-saver` (client export)
- Tiny UA helper for iOS Safari detection (no library).

## Files (planned)
- `supabase/migrations/<ts>_lesson_plan_templates.sql`
- `src/pages/LessonPlansEditor.tsx` (IT Manager)
- `src/components/lesson-plans/TemplateEditor.tsx`
- `src/components/lesson-plans/TemplateCanvas.tsx` (shared renderer for editor preview + staff view)
- `src/components/lesson-plans/PaletteSwitcher.tsx`
- `src/components/lesson-plans/ExportActions.tsx`
- `src/components/lesson-plans/SatisfactionModal.tsx`
- `src/lib/lessonPlanDefaults.ts` (default JSON for the 3 classes, 6 palettes)
- `src/lib/exportPdf.ts` (html2canvas + jsPDF wrapper)
- `src/lib/uaSupport.ts` (iOS Safari detection)
- Update `src/pages/MyTimetablePage.tsx` to load + render template + actions.
- Update `src/App.tsx` route, `DesktopSidebar.tsx`, `BottomNav.tsx`, `AppLayout.tsx`.

## Notes on “zero ongoing usage”
- Only 3 template rows total; staff page makes a single SELECT per visit (well within free tier).
- No realtime channels, no edge functions, no storage uploads from staff.
- Logo/watermark images stored as base64 inside `template_json` OR pasted URL — IT Manager’s choice. Default = base64 so no extra Storage bucket needed.
