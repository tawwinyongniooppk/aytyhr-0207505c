export type ClassName = "Beginner" | "Junior" | "Senior";

export interface CellStyle {
  fontFamily?: string;
  fontSize?: number; // px
  color?: string;
  bgColor?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  minFontSize?: number; // default 12
}

export interface Cell extends CellStyle {
  id: string;
  value: string;
  locked: boolean;
  colSpan?: number;
}

export interface Row {
  id: string;
  cells: Cell[];
}

export interface Card {
  id: string;
  title: string;
  bgColor?: string;
  borderColor?: string;
  columns: number;
  rows: Row[];
}

export type PageSize = "A4" | "Legal";
export type Orientation = "portrait" | "landscape";

export interface Watermark {
  text?: string;
  imageUrl?: string;
  opacity: number; // 0..1
}

export interface Branding {
  logoUrl?: string;
  headerText?: string;
  watermark: Watermark;
}

export interface PageSettings {
  size: PageSize;
  orientation: Orientation;
  margin: number; // mm
}

export interface Border {
  size: number; // px
  style: "solid" | "dashed" | "dotted";
  color: string;
}

export interface Palette {
  id: string;
  name: string;
  primary: string;
  accent: string;
  surface: string;
  text: string;
  border: string;
}

export interface LessonPlanTemplate {
  page: PageSettings;
  branding: Branding;
  palette: string; // palette id
  border: Border;
  letterheadFooterText: string;
  cards: Card[];
}
