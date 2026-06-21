export type ClassName = "Beginner" | "Junior" | "Senior";
export type TemplateFormat = "format1" | "format2" | "format3" | "format4" | "format5";

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
  options?: string[];
}

export interface Row {
  id: string;
  cells: Cell[];
  height?: number;
}

export interface Card {
  id: string;
  title: string;
  bgColor?: string;
  borderColor?: string;
  columns: number;
  rows: Row[];
  colWidths?: number[];
  free?: boolean;
  x?: number;
  y?: number;
  width?: number;
}

export type PageSize = "A4" | "Legal";
export type Orientation = "portrait" | "landscape";

export interface Watermark {
  text?: string;
  imageUrl?: string;
  opacity: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
}

export interface LogoBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Branding {
  logoUrl?: string;
  headerText?: string;
  freeLetterhead?: boolean;
  logoBox?: LogoBox;
  headerBox?: TextBox;
  footerBox?: TextBox;
  watermark: Watermark;
  /** Reserve space (px) at top of every page for header — content starts below this. */
  headerReservePx?: number;
}

export interface PageSettings {
  size: PageSize;
  orientation: Orientation;
  margin: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
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
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  imageUrl?: string;
  shape?: ShapeKind;
  bgColor?: string;
  borderColor?: string;
  borderWidth?: number;
  icon?: IconKind;
}

export interface PageContent {
  id: string;
  cards: Card[];
  freeElements?: FreeElement[];
}

export interface LessonPlanTemplate {
  page: PageSettings;
  branding: Branding;
  palette: string;
  border: Border;
  letterheadFooterText: string;
  cards: Card[];
  freeElements?: FreeElement[];
  /** Multi-page support. When set, cards/freeElements are derived from pages[currentPageIdx]. */
  pages?: PageContent[];
  /** Editor-facing label for the format tab (e.g. "Daily Plan"). */
  displayName?: string;
}
