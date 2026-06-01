export type ClassName = "Beginner" | "Junior" | "Senior";
export type TemplateFormat = "format1" | "format2";

export interface CellStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bgColor?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  minFontSize?: number;
}

export type CellPrefix = "none" | "bullet" | "number" | "checkbox" | "radio";

export interface Cell extends CellStyle {
  id: string;
  value: string;
  locked: boolean;
  colSpan?: number;
  prefix?: CellPrefix;
  options?: string[]; // dropdown choices for staff
}

export interface Row {
  id: string;
  cells: Cell[];
  height?: number; // px, optional
}

export interface Card {
  id: string;
  title: string;
  bgColor?: string;
  borderColor?: string;
  columns: number;
  rows: Row[];
  colWidths?: number[]; // percentage values summing ~100, length == columns
}

export type PageSize = "A4" | "Legal";
export type Orientation = "portrait" | "landscape";

export interface Watermark {
  text?: string;
  imageUrl?: string;
  opacity: number;
  x?: number; // px from top-left
  y?: number;
  width?: number; // px
  height?: number; // px
  rotation?: number; // deg
}

export interface Branding {
  logoUrl?: string;
  headerText?: string;
  watermark: Watermark;
}

export interface PageSettings {
  size: PageSize;
  orientation: Orientation;
  margin: number;
}

export interface Border {
  size: number;
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

export type FreeElementType = "text" | "image" | "shape" | "icon";
export type ShapeKind = "rect" | "circle" | "line";
export type IconKind = "check" | "cross" | "bullet" | "star" | "arrow";

export interface FreeElement {
  id: string;
  type: FreeElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
  // text
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  // image
  imageUrl?: string;
  // shape
  shape?: ShapeKind;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  // icon
  icon?: IconKind;
}

export interface LessonPlanTemplate {
  page: PageSettings;
  branding: Branding;
  palette: string;
  border: Border;
  letterheadFooterText: string;
  cards: Card[];
  freeElements?: FreeElement[];
}
