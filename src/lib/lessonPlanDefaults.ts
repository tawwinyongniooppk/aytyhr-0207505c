import type { LessonPlanTemplate, Palette, Cell, Row, TemplateFormat, PageContent } from "./lessonPlanTypes";

export const PALETTES: Palette[] = [
  { id: "ocean", name: "Ocean Deep", primary: "#0c2340", accent: "#2d8a9e", surface: "#f0f7fa", text: "#0c2340", border: "#5cbdb9" },
  { id: "noir-gold", name: "Noir & Gold", primary: "#0d0d0d", accent: "#c9a84c", surface: "#fdf9ef", text: "#1a1a1a", border: "#c9a84c" },
  { id: "sage-cream", name: "Sage & Cream", primary: "#4a6741", accent: "#87a878", surface: "#f5f0e8", text: "#2d3a26", border: "#a8c0a0" },
  { id: "navy-trust", name: "Navy Trust", primary: "#0f1b3d", accent: "#3b6fa0", surface: "#e8edf3", text: "#0f1b3d", border: "#3b6fa0" },
  { id: "burnt-sienna", name: "Burnt Sienna", primary: "#6b3a2a", accent: "#cd7f32", surface: "#faf0e6", text: "#3d1f12", border: "#a0522d" },
  { id: "emerald", name: "Emerald Prestige", primary: "#064e3b", accent: "#c9a84c", surface: "#f5f0e0", text: "#064e3b", border: "#0d7a5f" },
];

export const PALETTE_BY_ID = (id: string) => PALETTES.find(p => p.id === id) ?? PALETTES[0];

export const ALL_FORMATS: TemplateFormat[] = ["format1", "format2", "format3", "format4", "format5"];
export const MAX_FORMATS = 5;

const uid = () => Math.random().toString(36).slice(2, 10);

function makeCell(value: string, locked = false, extra: Partial<Cell> = {}): Cell {
  return { id: uid(), value, locked, fontSize: 12, minFontSize: 12, align: "left", prefix: "none", ...extra };
}

function makeRow(cells: Cell[]): Row {
  return { id: uid(), cells };
}

export function defaultTemplate(className: string, format: TemplateFormat = "format1"): LessonPlanTemplate {
  const cards = format === "format1"
    ? [
        {
          id: uid(),
          title: "Lesson Information",
          columns: 4,
          rows: [
            makeRow([
              makeCell("Date", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell(""),
              makeCell("Subject", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell(""),
            ]),
            makeRow([
              makeCell("Teacher", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell(""),
              makeCell("Period", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell(""),
            ]),
            makeRow([
              makeCell("Topic", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell("", false, { colSpan: 3 }),
            ]),
          ],
        },
        {
          id: uid(),
          title: "Learning Objectives & Activities",
          columns: 2,
          rows: [
            makeRow([
              makeCell("Learning Objectives", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell("Class Activities", true, { bold: true, bgColor: "#f1f5f9" }),
            ]),
            makeRow([makeCell(""), makeCell("")]),
          ],
        },
        {
          id: uid(),
          title: "Assessment & Remarks",
          columns: 2,
          rows: [
            makeRow([
              makeCell("Assessment / Homework", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell("Remarks", true, { bold: true, bgColor: "#f1f5f9" }),
            ]),
            makeRow([makeCell(""), makeCell("")]),
          ],
        },
      ]
    : [
        {
          id: uid(),
          title: "Weekly Overview",
          columns: 2,
          rows: [
            makeRow([
              makeCell("Week", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell(""),
            ]),
            makeRow([
              makeCell("Theme / Unit", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell(""),
            ]),
          ],
        },
        {
          id: uid(),
          title: "Daily Plan",
          columns: 3,
          rows: [
            makeRow([
              makeCell("Day", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell("Topic", true, { bold: true, bgColor: "#f1f5f9" }),
              makeCell("Notes", true, { bold: true, bgColor: "#f1f5f9" }),
            ]),
            makeRow([makeCell("Mon", true), makeCell(""), makeCell("")]),
            makeRow([makeCell("Tue", true), makeCell(""), makeCell("")]),
            makeRow([makeCell("Wed", true), makeCell(""), makeCell("")]),
            makeRow([makeCell("Thu", true), makeCell(""), makeCell("")]),
            makeRow([makeCell("Fri", true), makeCell(""), makeCell("")]),
          ],
        },
      ];

  const labelByFormat: Record<TemplateFormat, string> = {
    format1: "Format 1",
    format2: "Format 2",
    format3: "Format 3",
    format4: "Format 4",
    format5: "Format 5",
  };

  return {
    page: { size: "A4", orientation: "portrait", margin: 12 },
    branding: {
      logoUrl: "",
      headerText: `${className} Class — Lesson Plan${format !== "format1" ? ` (${labelByFormat[format]})` : ""}`,
      freeLetterhead: false,
      logoBox: { x: 40, y: 30, width: 80, height: 80 },
      headerBox: { x: 140, y: 40, width: 560, height: 50, fontSize: 22, color: "#0c2340", bold: true, align: "left" },
      footerBox: { x: 40, y: 100, width: 660, height: 24, fontSize: 11, color: "#2d8a9e", italic: true, align: "left" },
      watermark: { text: "", opacity: 0.08, x: 200, y: 400, width: 400, height: 200, rotation: -30 },
      headerReservePx: 0,
    },
    palette: format === "format1" ? "ocean" : "sage-cream",
    border: { size: 1, style: "solid", color: "#94a3b8" },
    letterheadFooterText: "Prepared by teacher · For internal use only",
    cards,
    freeElements: [],
    pages: [{ id: uid(), cards, freeElements: [] }],
    displayName: labelByFormat[format],
  };
}

export function newEmptyPage(): PageContent {
  return { id: uid(), cards: [], freeElements: [] };
}

/** Fill in any missing new fields so old saved templates still render correctly */
export function normalizeTemplate(t: any, className: string, format: TemplateFormat): LessonPlanTemplate {
  if (!t || typeof t !== "object" || !Array.isArray(t.cards)) return defaultTemplate(className, format);
  const wm = t.branding?.watermark ?? {};
  const b = t.branding ?? {};
  const normalized: LessonPlanTemplate = {
    ...t,
    branding: {
      ...b,
      freeLetterhead: !!b.freeLetterhead,
      logoBox: b.logoBox ?? { x: 40, y: 30, width: 80, height: 80 },
      headerBox: b.headerBox ?? { x: 140, y: 40, width: 560, height: 50, fontSize: 22, color: "#0c2340", bold: true, align: "left" },
      footerBox: b.footerBox ?? { x: 40, y: 100, width: 660, height: 24, fontSize: 11, color: "#2d8a9e", italic: true, align: "left" },
      headerReservePx: typeof b.headerReservePx === "number" ? b.headerReservePx : 0,
      watermark: {
        text: wm.text ?? "",
        imageUrl: wm.imageUrl ?? "",
        opacity: typeof wm.opacity === "number" ? wm.opacity : 0.08,
        x: wm.x ?? 200,
        y: wm.y ?? 400,
        width: wm.width ?? 400,
        height: wm.height ?? 200,
        rotation: wm.rotation ?? -30,
      },
    },
    cards: t.cards.map((c: any) => ({
      ...c,
      colWidths: Array.isArray(c.colWidths) && c.colWidths.length === c.columns ? c.colWidths : undefined,
      rows: c.rows.map((r: any) => ({
        ...r,
        height: r.height,
        cells: r.cells.map((cell: any) => ({
          prefix: "none" as const,
          ...cell,
        })),
      })),
    })),
    freeElements: Array.isArray(t.freeElements) ? t.freeElements : [],
    displayName: typeof t.displayName === "string" && t.displayName.trim() ? t.displayName : undefined,
  } as LessonPlanTemplate;

  if (Array.isArray(t.pages) && t.pages.length > 0) {
    normalized.pages = t.pages.map((p: any) => ({
      id: typeof p.id === "string" ? p.id : uid(),
      cards: Array.isArray(p.cards) ? p.cards : [],
      freeElements: Array.isArray(p.freeElements) ? p.freeElements : [],
    }));
  } else {
    normalized.pages = [{ id: uid(), cards: normalized.cards, freeElements: normalized.freeElements }];
  }

  return normalized;
}

/** Pull the per-page slice as the template the canvas/editor sees. */
export function templateForPage(t: LessonPlanTemplate, pageIdx: number): LessonPlanTemplate {
  const pages = t.pages && t.pages.length > 0 ? t.pages : [{ id: "p0", cards: t.cards, freeElements: t.freeElements }];
  const idx = Math.max(0, Math.min(pageIdx, pages.length - 1));
  return { ...t, cards: pages[idx].cards, freeElements: pages[idx].freeElements ?? [] };
}

/** Write the edited per-page slice back into the multi-page template. */
export function writePageBack(t: LessonPlanTemplate, pageIdx: number, edited: LessonPlanTemplate): LessonPlanTemplate {
  const pages = (t.pages && t.pages.length > 0 ? t.pages : [{ id: "p0", cards: t.cards, freeElements: t.freeElements }]).map(p => ({ ...p }));
  const idx = Math.max(0, Math.min(pageIdx, pages.length - 1));
  pages[idx] = { ...pages[idx], cards: edited.cards, freeElements: edited.freeElements };
  return {
    ...edited,
    pages,
    // Keep top-level cards/freeElements mirroring page 0 for backward compat with any old reader.
    cards: pages[0].cards,
    freeElements: pages[0].freeElements,
  };
}

export const PAGE_PX = {
  A4: { width: 794, height: 1123 },
  Legal: { width: 816, height: 1344 },
};
