# Lesson Plan Template Editor — Major Overhaul

## Scope

Per class (Beginner / Junior / Senior), allow IT Manager to maintain **two templates**: **Format 1** and **Format 2**. Rebuild the editor UX into a true side-by-side workspace with rich design controls, free-floating elements, image uploads (not URLs), and resizable rows/columns.

## Changes

### 1. Storage — dual format per class
- Migration: add `format` column (`'format1' | 'format2'`) to `lesson_plan_templates`, replace unique key on `class` with `(class, format)`.
- Update `LessonPlansEditor.tsx` and `MyTimetablePage.tsx` to load/save by `(class, format)`. Staff page gets a Format 1 / Format 2 toggle.

### 2. Layout — side-by-side workspace
- Replace stacked toolbar-above / preview-below layout with a 2-column grid:
  - Left (≈360–420px, sticky, scrollable): tool panels — Page / Letterhead / Watermark / Palette / Border / Cards (with **Add Card** button) / Free Elements.
  - Right (flex 1, sticky preview): canvas preview.
- Use `ResizablePanelGroup` for desktop; stacked on mobile.

### 3. Cards — unlimited, resizable rows/columns
- "Add Card" / "Delete Card" controls in left panel.
- Per-row height (px) and per-column width (% or px) adjustable via drag handles **except** outer-border rows/columns (first/last row & first/last column locked to auto/equal).
- Stored as `rowHeights: number[]` and `colWidths: number[]` on each Card.

### 4. Cell-level features
- New `Cell` fields:
  - `prefix`: `none | bullet | number | checkbox | radio` rendered before value.
  - `options?: string[]` — when present, cell becomes a dropdown (select) in staff edit mode with these preset names; IT Manager edits the list in a popover.
- Existing font controls (size, family, bold/italic/underline, color, bg, align) retained and surfaced per selected cell.

### 5. Free-floating elements (drag & drop on page)
- New `freeElements: FreeElement[]` array on template.
- Types: `text`, `image`, `shape` (rect/circle/line), `icon` (check/bullet/etc.).
- Each has `{ id, type, x, y, width, height, rotation, zIndex, style }`.
- Rendered absolutely-positioned over the canvas; draggable & resizable via `react-rnd` (add dependency) in editor mode; locked in staff view but printed in PDF.
- Toolbar: "Add Text", "Add Image", "Add Shape", "Add Icon".

### 6. Letterhead & Watermark — image upload
- Replace URL inputs with file upload to existing Supabase Storage (create `lesson-plan-assets` public bucket via migration if missing).
- Placeholder text: `"Upload image (recommended 1200×300 px, PNG/JPG, < 2MB)"` for letterhead; `"Upload watermark (recommended 800×800 px, transparent PNG, < 2MB)"` for watermark.
- Watermark gains: `x, y, width, height, rotation, opacity` — draggable/resizable on canvas like free elements. Watermark text supports same transforms.

### 7. Types & defaults
- Extend `LessonPlanTemplate`, `Card`, `Cell`, `Watermark` types in `src/lib/lessonPlanTypes.ts`.
- Update `defaultTemplate` to be format-aware (Format 1 = current default; Format 2 = a second variant with different cards).
- Keep backward compatibility: loader fills missing fields with defaults so old saved templates still render.

### 8. Files touched
- Migration: add `format` column + unique constraint + storage bucket + policies.
- `src/lib/lessonPlanTypes.ts`, `src/lib/lessonPlanDefaults.ts`
- `src/components/lesson-plans/TemplateEditor.tsx` — full rewrite into side-by-side, add panels for free elements, cell options, image upload, resizable rows/cols.
- `src/components/lesson-plans/TemplateCanvas.tsx` — render `freeElements`, cell prefixes/dropdowns, row heights, column widths, draggable watermark.
- `src/pages/LessonPlansEditor.tsx` — Format 1 / Format 2 sub-tabs under each class tab.
- `src/pages/MyTimetablePage.tsx` — Format selector for staff.
- New: `src/components/lesson-plans/ImageUpload.tsx` (reusable uploader to `lesson-plan-assets`).
- Add `react-rnd` dependency for drag/resize.

## Out of scope
- No changes to attendance, leave, salary, auth flows.
- PDF export keeps current `exportPagesToPdf`; absolute-positioned elements already captured by html2canvas.

## Risks
- Old saved templates: handled by defensive defaulting in loader.
- `react-rnd` bundle size: acceptable (~30kb gz).
