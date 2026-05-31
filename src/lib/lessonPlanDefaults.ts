import type { LessonPlanTemplate, Palette, Cell, Row } from "./lessonPlanTypes";

export const PALETTES: Palette[] = [
  { id: "ocean", name: "Ocean Deep", primary: "#0c2340", accent: "#2d8a9e", surface: "#f0f7fa", text: "#0c2340", border: "#5cbdb9" },
  { id: "noir-gold", name: "Noir & Gold", primary: "#0d0d0d", accent: "#c9a84c", surface: "#fdf9ef", text: "#1a1a1a", border: "#c9a84c" },
  { id: "sage-cream", name: "Sage & Cream", primary: "#4a6741", accent: "#87a878", surface: "#f5f0e8", text: "#2d3a26", border: "#a8c0a0" },
  { id: "navy-trust", name: "Navy Trust", primary: "#0f1b3d", accent: "#3b6fa0", surface: "#e8edf3", text: "#0f1b3d", border: "#3b6fa0" },
  { id: "burnt-sienna", name: "Burnt Sienna", primary: "#6b3a2a", accent: "#cd7f32", surface: "#faf0e6", text: "#3d1f12", border: "#a0522d" },
  { id: "emerald", name: "Emerald Prestige", primary: "#064e3b", accent: "#c9a84c", surface: "#f5f0e0", text: "#064e3b", border: "#0d7a5f" },
];

export const PALETTE_BY_ID = (id: string) => PALETTES.find(p => p.id === id) ?? PALETTES[0];

const uid = () => Math.random().toString(36).slice(2, 10);

function makeCell(value: string, locked = false, extra: Partial<Cell> = {}): Cell {
  return { id: uid(), value, locked, fontSize: 12, minFontSize: 12, align: "left", ...extra };
}

function makeRow(cells: Cell[]): Row {
  return { id: uid(), cells };
}

export function defaultTemplate(className: string): LessonPlanTemplate {
  return {
    page: { size: "A4", orientation: "portrait", margin: 12 },
    branding: {
      logoUrl: "",
      headerText: `${className} Class — Lesson Plan`,
      watermark: { text: "", opacity: 0.08 },
    },
    palette: "ocean",
    border: { size: 1, style: "solid", color: "#94a3b8" },
    letterheadFooterText: "Prepared by teacher · For internal use only",
    cards: [
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
    ],
  };
}

export const PAGE_PX = {
  // 96 dpi, portrait dimensions (mm → px). landscape swaps.
  A4: { width: 794, height: 1123 },
  Legal: { width: 816, height: 1344 },
};
