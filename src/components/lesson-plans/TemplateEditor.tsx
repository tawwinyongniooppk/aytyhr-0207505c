import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from "react";
import { Rnd } from "react-rnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Bold, Italic, Underline, Plus, Trash2, Lock, Unlock, Type, Image as ImageIcon, Square, Star,
  Check, X as XIcon, Circle as CircleIcon, ArrowRight, GripVertical, Info, ZoomIn, ZoomOut, Maximize2,
  Table2, Rows3, Columns3, AlignLeft, AlignCenter, AlignRight, FileText, Palette as PaletteIcon, Layers,
} from "lucide-react";
import { TemplateCanvas } from "./TemplateCanvas";
import { ImageUpload } from "./ImageUpload";
import type { LessonPlanTemplate, Cell, FreeElement, FreeElementType } from "@/lib/lessonPlanTypes";
import { PALETTES, PAGE_PX } from "@/lib/lessonPlanDefaults";

interface Props {
  value: LessonPlanTemplate;
  onChange: (v: LessonPlanTemplate) => void;
  /** Multi-page context (optional). When provided, a page strip renders under the preview. */
  pageIdx?: number;
  pageCount?: number;
  onSelectPage?: (idx: number) => void;
  onAddPage?: () => void;
  onDeletePage?: (idx: number) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Small ℹ️ hint that replaces long instructional paragraphs. */
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-primary" data-no-lift>
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}

function Group({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-3 min-w-0">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {hint && <Hint>{hint}</Hint>}
      </div>
      <div className="flex items-end gap-2 flex-wrap">{children}</div>
    </div>
  );
}

export function TemplateEditor({ value, onChange, pageIdx, pageCount, onSelectPage, onAddPage, onDeletePage }: Props) {
  const [selected, setSelected] = useState<{ cardId: string; rowId: string; cellId: string } | null>(null);
  const [selectedFreeId, setSelectedFreeId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [optionsDraft, setOptionsDraft] = useState<string>("");
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [zoom, setZoom] = useState(0.78);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Observe rendered free-card heights so the interactive Rnd outline matches the actual table.
  useLayoutEffect(() => {
    const root = previewContainerRef.current;
    if (!root) return;
    const measureAll = () => {
      const next: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>("[data-free-card-id]").forEach((el) => {
        const id = el.getAttribute("data-free-card-id");
        if (!id) return;
        next[id] = Math.max(40, el.offsetHeight);
      });
      setCardHeights((prev) => {
        const changed = Object.keys(next).some((k) => prev[k] !== next[k]) || Object.keys(prev).length !== Object.keys(next).length;
        return changed ? next : prev;
      });
    };
    measureAll();
    const ro = new ResizeObserver(measureAll);
    root.querySelectorAll<HTMLElement>("[data-free-card-id]").forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [value.cards]);


  // Page dimensions & margins for clamping free-card positions inside the printable area.
  const pageDims = useMemo(() => {
    const base = PAGE_PX[value.page.size];
    return value.page.orientation === "portrait" ? { width: base.width, height: base.height } : { width: base.height, height: base.width };
  }, [value.page.size, value.page.orientation]);
  const mmToPx = (mm: number) => (mm / 25.4) * 96;
  const marginTop = mmToPx(value.page.marginTop ?? value.page.margin);
  const marginRight = mmToPx(value.page.marginRight ?? value.page.margin);
  const marginBottom = mmToPx(value.page.marginBottom ?? value.page.margin);
  const marginLeft = mmToPx(value.page.marginLeft ?? value.page.margin);
  const contentMaxX = pageDims.width - marginRight;
  const contentMaxY = pageDims.height - marginBottom;
  const clampCard = (x: number, y: number, w: number, hint = 40) => {
    const width = Math.max(120, Math.min(w, pageDims.width - marginLeft - marginRight));
    const clampedX = Math.max(marginLeft, Math.min(x, contentMaxX - width));
    const clampedY = Math.max(marginTop, Math.min(y, Math.max(marginTop, contentMaxY - hint)));
    return { x: clampedX, y: clampedY, width };
  };

  const fitToScreen = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const avail = el.clientWidth - 48;
    if (avail <= 0) return;
    setZoom(Math.max(0.25, Math.min(1.5, avail / pageDims.width)));
  }, [pageDims.width]);


  const reorderCards = (fromId: string, toId: string | null) => {
    if (fromId === toId) return;
    const from = value.cards.findIndex(c => c.id === fromId);
    if (from < 0) return;
    const next = [...value.cards];
    const [moved] = next.splice(from, 1);
    if (toId === null) {
      next.push(moved); // drop on empty canvas → append
    } else {
      const to = next.findIndex(c => c.id === toId);
      if (to < 0) { next.splice(from, 0, moved); return; }
      next.splice(to, 0, moved);
    }
    onChange({ ...value, cards: next });
  };

  const selectedCell = useMemo(() => {
    if (!selected) return null;
    const card = value.cards.find(c => c.id === selected.cardId);
    const row = card?.rows.find(r => r.id === selected.rowId);
    return row?.cells.find(c => c.id === selected.cellId) ?? null;
  }, [selected, value]);

  const selectedFree = useMemo(() => value.freeElements?.find(e => e.id === selectedFreeId) ?? null, [selectedFreeId, value.freeElements]);
  const selectedCard = useMemo(() => value.cards.find(c => c.id === selectedCardId) ?? null, [selectedCardId, value.cards]);

  const updateCell = useCallback((patch: Partial<Cell>) => {
    if (!selected) return;
    onChange({
      ...value,
      cards: value.cards.map(c => c.id !== selected.cardId ? c : {
        ...c,
        rows: c.rows.map(r => r.id !== selected.rowId ? r : {
          ...r,
          cells: r.cells.map(cell => cell.id !== selected.cellId ? cell : { ...cell, ...patch }),
        }),
      }),
    });
  }, [selected, value, onChange]);

  const onCellChange = (cardId: string, rowId: string, cellId: string, v: string) => {
    onChange({
      ...value,
      cards: value.cards.map(c => c.id !== cardId ? c : {
        ...c,
        rows: c.rows.map(r => r.id !== rowId ? r : {
          ...r,
          cells: r.cells.map(cell => cell.id !== cellId ? cell : { ...cell, value: v }),
        }),
      }),
    });
  };

  const addRow = (cardId: string) => {
    onChange({
      ...value,
      cards: value.cards.map(c => {
        if (c.id !== cardId) return c;
        const cells: Cell[] = Array.from({ length: c.columns }, () => ({
          id: uid(), value: "", locked: false, fontSize: 12, minFontSize: 12, align: "left", prefix: "none",
        }));
        return { ...c, rows: [...c.rows, { id: uid(), cells }] };
      }),
    });
  };

  const removeRow = (cardId: string, rowId: string) => {
    onChange({
      ...value,
      cards: value.cards.map(c => c.id !== cardId ? c : { ...c, rows: c.rows.filter(r => r.id !== rowId) }),
    });
  };

  const setCardColumns = (cardId: string, columns: number) => {
    onChange({
      ...value,
      cards: value.cards.map(c => {
        if (c.id !== cardId) return c;
        const rows = c.rows.map(r => {
          const cells = [...r.cells];
          while (cells.length < columns) cells.push({ id: uid(), value: "", locked: false, fontSize: 12, minFontSize: 12, align: "left", prefix: "none" });
          while (cells.length > columns) cells.pop();
          return { ...r, cells };
        });
        const colWidths = Array.from({ length: columns }, () => 100 / columns);
        return { ...c, columns, rows, colWidths };
      }),
    });
  };

  const updateColWidth = (cardId: string, colIdx: number, pct: number) => {
    onChange({
      ...value,
      cards: value.cards.map(c => {
        if (c.id !== cardId) return c;
        const widths = c.colWidths && c.colWidths.length === c.columns ? [...c.colWidths] : Array.from({ length: c.columns }, () => 100 / c.columns);
        // adjacent column compensates; only the table's outer edges are non-draggable
        if (colIdx < 0 || colIdx >= c.columns - 1) return c;
        const left = widths[colIdx];
        const right = widths[colIdx + 1];
        const total = left + right;
        const newLeft = Math.max(5, Math.min(total - 5, pct));
        widths[colIdx] = newLeft;
        widths[colIdx + 1] = total - newLeft;
        return { ...c, colWidths: widths };
      }),
    });
  };

  const updateRowHeight = (cardId: string, rowId: string, height: number) => {
    onChange({
      ...value,
      cards: value.cards.map(c => c.id !== cardId ? c : {
        ...c,
        rows: c.rows.map(r => r.id !== rowId ? r : { ...r, height }),
      }),
    });
  };

  const addCard = () => {
    // Cards are now always free-placed (PowerPoint style). Stagger new tables inside the margin area.
    const offset = value.cards.length * 40;
    const initX = Math.min(marginLeft + 20 + offset, contentMaxX - 400);
    const initY = Math.min(marginTop + 40 + offset, contentMaxY - 100);
    onChange({
      ...value,
      cards: [
        ...value.cards,
        {
          id: uid(),
          title: `Table ${value.cards.length + 1}`,
          columns: 2,
          colWidths: [50, 50],
          free: true,
          x: initX,
          y: initY,
          width: Math.min(600, pageDims.width - marginLeft - marginRight),
          rows: [
            { id: uid(), cells: [
              { id: uid(), value: "Heading", locked: true, bold: true, bgColor: "#f1f5f9", fontSize: 12, minFontSize: 12, align: "left", prefix: "none" },
              { id: uid(), value: "", locked: false, fontSize: 12, minFontSize: 12, align: "left", prefix: "none" },
            ] },
          ],
        },
      ],
    });
  };

  const removeCard = (cardId: string) => {
    onChange({ ...value, cards: value.cards.filter(c => c.id !== cardId) });
    if (selectedCardId === cardId) setSelectedCardId(null);
    if (selected?.cardId === cardId) setSelected(null);
  };

  // ---- Free elements ----
  const addFree = (type: FreeElementType) => {
    const base: FreeElement = {
      id: uid(), type, x: 80, y: 120, width: type === "icon" ? 32 : 160, height: type === "text" ? 40 : type === "icon" ? 32 : 100, rotation: 0, zIndex: 5,
    };
    let el: FreeElement = base;
    if (type === "text") el = { ...base, text: "New text", fontSize: 16, color: "#111827", align: "left" };
    if (type === "shape") el = { ...base, shape: "rect", bgColor: "transparent", borderColor: "#111827", borderWidth: 1 };
    if (type === "icon") el = { ...base, icon: "check", color: "#111827" };
    if (type === "image") el = { ...base, imageUrl: "" };
    onChange({ ...value, freeElements: [...(value.freeElements ?? []), el] });
    setSelectedFreeId(el.id);
    setSelected(null);
    setSelectedCardId(null);
  };

  const updateFree = (id: string, patch: Partial<FreeElement>) => {
    onChange({
      ...value,
      freeElements: (value.freeElements ?? []).map(e => e.id === id ? { ...e, ...patch } : e),
    });
  };

  const removeFree = (id: string) => {
    onChange({ ...value, freeElements: (value.freeElements ?? []).filter(e => e.id !== id) });
    if (selectedFreeId === id) setSelectedFreeId(null);
  };

  const updateWatermark = (patch: Partial<typeof value.branding.watermark>) => {
    onChange({ ...value, branding: { ...value.branding, watermark: { ...value.branding.watermark, ...patch } } });
  };

  const updateBranding = (patch: Partial<typeof value.branding>) => {
    onChange({ ...value, branding: { ...value.branding, ...patch } });
  };
  const updateLogoBox = (patch: Partial<NonNullable<typeof value.branding.logoBox>>) => {
    updateBranding({ logoBox: { ...(value.branding.logoBox ?? { x: 40, y: 30, width: 80, height: 80 }), ...patch } });
  };
  const updateHeaderBox = (patch: Partial<NonNullable<typeof value.branding.headerBox>>) => {
    updateBranding({ headerBox: { ...(value.branding.headerBox ?? { x: 140, y: 40, width: 560, height: 50 }), ...patch } });
  };
  const updateFooterBox = (patch: Partial<NonNullable<typeof value.branding.footerBox>>) => {
    updateBranding({ footerBox: { ...(value.branding.footerBox ?? { x: 40, y: 100, width: 660, height: 24 }), ...patch } });
  };
  const updateCardBox = (cardId: string, patch: { x?: number; y?: number; width?: number }) => {
    onChange({
      ...value,
      cards: value.cards.map(c => {
        if (c.id !== cardId) return c;
        const next = { ...c, ...patch };
        const clamped = clampCard(next.x ?? marginLeft, next.y ?? marginTop, next.width ?? 400, cardHeights[c.id] ?? 60);
        return { ...next, x: clamped.x, y: clamped.y, width: clamped.width };
      }),
    });
  };

  // Auto-migrate legacy in-flow cards to free-placed layout so every table can be moved directly.
  const migrationDoneRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = value.cards.map(c => c.id).join("|");
    const needsMigration = value.cards.some(c => !c.free);
    if (!needsMigration || migrationDoneRef.current === sig) return;
    migrationDoneRef.current = sig;
    let y = marginTop + 20;
    const migrated = value.cards.map((c) => {
      if (c.free) return c;
      const initX = marginLeft + 10;
      const width = Math.min(c.width ?? pageDims.width - marginLeft - marginRight - 20, pageDims.width - marginLeft - marginRight);
      const cardY = Math.min(y, contentMaxY - 60);
      y = cardY + 220; // estimate; measured heights update later
      return { ...c, free: true, x: initX, y: cardY, width };
    });
    onChange({ ...value, cards: migrated });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.cards.map(c => c.id).join("|")]);


  // Sync options draft when selecting cell
  const onSelectCell = (cardId: string, rowId: string, cellId: string) => {
    setSelected({ cardId, rowId, cellId });
    setSelectedCardId(cardId);
    setSelectedFreeId(null);
    const card = value.cards.find(c => c.id === cardId);
    const row = card?.rows.find(r => r.id === rowId);
    const cell = row?.cells.find(c => c.id === cellId);
    setOptionsDraft((cell?.options ?? []).join("\n"));
  };

  const propsPanelOpen = !!selectedCell || !!selectedFree;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* ================= RIBBON ================= */}
        <Tabs defaultValue="page" className="w-full">
          <div className="border-b bg-muted/40 px-2 pt-2">
            <TabsList className="h-9 bg-transparent p-0 gap-1">
              <TabsTrigger value="page" className="h-8 data-[state=active]:bg-background"><FileText className="h-3.5 w-3.5 mr-1.5" />Page Setup</TabsTrigger>
              <TabsTrigger value="insert" className="h-8 data-[state=active]:bg-background"><Plus className="h-3.5 w-3.5 mr-1.5" />Insert</TabsTrigger>
              <TabsTrigger value="table" className="h-8 data-[state=active]:bg-background"><Table2 className="h-3.5 w-3.5 mr-1.5" />Table Tools</TabsTrigger>
              <TabsTrigger value="style" className="h-8 data-[state=active]:bg-background"><PaletteIcon className="h-3.5 w-3.5 mr-1.5" />Styling</TabsTrigger>
            </TabsList>
          </div>

          {/* ---- Page Setup ---- */}
          <TabsContent value="page" className="m-0 border-b bg-background">
            <div className="flex items-start gap-0 divide-x overflow-x-auto py-3">
              <Group title="Page">
                <div className="w-28">
                  <Label className="text-[10px]">Size</Label>
                  <Select value={value.page.size} onValueChange={(v: any) => onChange({ ...value, page: { ...value.page, size: v } })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="Legal">Legal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <Label className="text-[10px]">Orientation</Label>
                  <Select value={value.page.orientation} onValueChange={(v: any) => onChange({ ...value, page: { ...value.page, orientation: v } })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Group>

              <Group title="Margins (mm)" hint="Margin တန်ဖိုးများကို ပြောင်းလျှင် Table များသည် printable area အတွင်း၌သာ ရွှေ့နိုင်ပါသည်။">
                <div className="w-20">
                  <Label className="text-[10px]">All</Label>
                  <Input className="h-8" type="number" min={4} max={40} value={value.page.margin}
                    onChange={e => {
                      const v = Number(e.target.value) || 0;
                      onChange({ ...value, page: { ...value.page, margin: v, marginTop: v, marginRight: v, marginBottom: v, marginLeft: v } });
                    }} />
                </div>
                <div className="w-16"><Label className="text-[10px]">Top</Label><Input className="h-8" type="number" min={0} max={60} value={value.page.marginTop ?? value.page.margin} onChange={e => onChange({ ...value, page: { ...value.page, marginTop: Number(e.target.value) || 0 } })} /></div>
                <div className="w-16"><Label className="text-[10px]">Right</Label><Input className="h-8" type="number" min={0} max={60} value={value.page.marginRight ?? value.page.margin} onChange={e => onChange({ ...value, page: { ...value.page, marginRight: Number(e.target.value) || 0 } })} /></div>
                <div className="w-16"><Label className="text-[10px]">Bottom</Label><Input className="h-8" type="number" min={0} max={60} value={value.page.marginBottom ?? value.page.margin} onChange={e => onChange({ ...value, page: { ...value.page, marginBottom: Number(e.target.value) || 0 } })} /></div>
                <div className="w-16"><Label className="text-[10px]">Left</Label><Input className="h-8" type="number" min={0} max={60} value={value.page.marginLeft ?? value.page.margin} onChange={e => onChange({ ...value, page: { ...value.page, marginLeft: Number(e.target.value) || 0 } })} /></div>
              </Group>

              {typeof pageCount === "number" && pageCount > 0 && onSelectPage && (
                <Group title="Pages">
                  <div className="flex items-center gap-1 flex-wrap">
                    {Array.from({ length: pageCount }, (_, i) => (
                      <div key={i} className="flex items-center">
                        <Button size="sm" className="h-8" variant={i === (pageIdx ?? 0) ? "default" : "outline"} onClick={() => onSelectPage(i)}>Page {i + 1}</Button>
                        {pageCount > 1 && onDeletePage && (
                          <Button size="icon" variant="ghost" className="h-8 w-7 text-destructive" onClick={() => onDeletePage(i)} title="Delete page"><Trash2 className="h-3 w-3" /></Button>
                        )}
                      </div>
                    ))}
                    {onAddPage && <Button size="sm" variant="outline" className="h-8 border-dashed" onClick={onAddPage}><Plus className="h-3 w-3 mr-1" />Add page</Button>}
                  </div>
                </Group>
              )}
            </div>
          </TabsContent>

          {/* ---- Insert ---- */}
          <TabsContent value="insert" className="m-0 border-b bg-background">
            <div className="flex items-start gap-0 divide-x overflow-x-auto py-3">
              <Group title="Blocks" hint="Table သို့မဟုတ် element ထည့်ပြီးလျှင် Canvas ပေါ်တွင် တိုက်ရိုက် ဖိဆွဲ၍ ရွှေ့/အရွယ်ချိန်နိုင်ပါသည်။">
                <Button size="sm" variant="outline" className="h-8" onClick={addCard}><Table2 className="h-3.5 w-3.5 mr-1" />Table</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => addFree("text")}><Type className="h-3.5 w-3.5 mr-1" />Text</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => addFree("image")}><ImageIcon className="h-3.5 w-3.5 mr-1" />Image</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => addFree("shape")}><Square className="h-3.5 w-3.5 mr-1" />Shape</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => addFree("icon")}><Star className="h-3.5 w-3.5 mr-1" />Icon</Button>
              </Group>

              <Group title="Letterhead" hint="Logo, Header, Footer တို့ကို Free placement ဖွင့်ပြီး preview ပေါ်တွင် တိုက်ရိုက် drag/resize လုပ်နိုင်ပါသည်။">
                <div className="w-56"><ImageUpload label="Logo image" value={value.branding.logoUrl} onChange={url => updateBranding({ logoUrl: url })} placeholder="Upload logo" recommendation="1200×300 px, PNG/JPG, < 2MB" /></div>
                <div className="w-56">
                  <Label className="text-[10px]">Header text</Label>
                  <Input className="h-8" value={value.branding.headerText ?? ""} onChange={e => updateBranding({ headerText: e.target.value })} />
                </div>
                <div className="w-64">
                  <Label className="text-[10px]">Footer text</Label>
                  <Textarea rows={2} value={value.letterheadFooterText} onChange={e => onChange({ ...value, letterheadFooterText: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 pb-1.5">
                  <Label className="text-[10px]">Free placement</Label>
                  <Switch checked={!!value.branding.freeLetterhead} onCheckedChange={v => updateBranding({ freeLetterhead: v })} />
                </div>
              </Group>

              <Group title="Watermark" hint="Watermark ကို preview ပေါ်တွင် တိုက်ရိုက် ဖိဆွဲ၍ ရွှေ့/အရွယ်ချိန်နိုင်ပါသည်။">
                <div className="w-44">
                  <Label className="text-[10px]">Text</Label>
                  <Input className="h-8" value={value.branding.watermark.text ?? ""} onChange={e => updateWatermark({ text: e.target.value })} />
                </div>
                <div className="w-52"><ImageUpload label="Image" value={value.branding.watermark.imageUrl} onChange={url => updateWatermark({ imageUrl: url })} placeholder="Upload watermark" recommendation="800×800 px, transparent PNG, < 2MB" /></div>
                <div className="w-40">
                  <Label className="text-[10px]">Opacity ({Math.round(value.branding.watermark.opacity * 100)}%)</Label>
                  <Slider className="mt-3" min={0} max={80} step={1} value={[value.branding.watermark.opacity * 100]} onValueChange={([v]) => updateWatermark({ opacity: v / 100 })} />
                </div>
                <div className="w-40">
                  <Label className="text-[10px]">Rotation ({value.branding.watermark.rotation ?? 0}°)</Label>
                  <Slider className="mt-3" min={-180} max={180} step={1} value={[value.branding.watermark.rotation ?? 0]} onValueChange={([v]) => updateWatermark({ rotation: v })} />
                </div>
              </Group>
            </div>
          </TabsContent>

          {/* ---- Table Tools ---- */}
          <TabsContent value="table" className="m-0 border-b bg-background">
            {!selectedCard ? (
              <div className="px-4 py-4 text-xs text-muted-foreground">Canvas ပေါ်ရှိ Table တစ်ခုကို နှိပ်ပါ — ထို့နောက် Row / Column / Style tools များ ဤနေရာတွင် ပေါ်လာပါမည်။</div>
            ) : (
              <div className="flex items-start gap-0 divide-x overflow-x-auto py-3">
                <Group title="Table">
                  <div className="w-48">
                    <Label className="text-[10px]">Title</Label>
                    <Input className="h-8" value={selectedCard.title} onChange={e => onChange({ ...value, cards: value.cards.map(c => c.id === selectedCard.id ? { ...c, title: e.target.value } : c) })} />
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => removeCard(selectedCard.id)}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete table</Button>
                </Group>

                <Group title="Rows" hint="Row တစ်ခု၏ အောက်ဘက် border ကို drag လုပ်၍ height ကို Excel ပုံစံ ပြောင်းနိုင်ပါသည် (နောက်ဆုံး row မထိပါ)။">
                  <Button size="sm" variant="outline" className="h-8" onClick={() => addRow(selectedCard.id)}><Rows3 className="h-3.5 w-3.5 mr-1" />Add row</Button>
                  <Button size="sm" variant="outline" className="h-8" disabled={selectedCard.rows.length <= 1} onClick={() => removeRow(selectedCard.id, selectedCard.rows[selectedCard.rows.length - 1].id)}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete row</Button>
                </Group>

                <Group title="Columns" hint="Preview ပေါ်တွင် inner column borders များကို Excel ပုံစံ drag လုပ်၍ resize နိုင်ပါသည် (ထိပ်ဆုံး/နောက်ဆုံး အစွန်းများ မပြောင်းပါ)။">
                  <Button size="sm" variant="outline" className="h-8" disabled={selectedCard.columns >= 8} onClick={() => setCardColumns(selectedCard.id, Math.min(8, selectedCard.columns + 1))}><Columns3 className="h-3.5 w-3.5 mr-1" />Add column</Button>
                  <Button size="sm" variant="outline" className="h-8" disabled={selectedCard.columns <= 1} onClick={() => setCardColumns(selectedCard.id, Math.max(1, selectedCard.columns - 1))}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete column</Button>
                  <div className="w-20">
                    <Label className="text-[10px]">Count</Label>
                    <Input className="h-8" type="number" min={1} max={8} value={selectedCard.columns} onChange={e => setCardColumns(selectedCard.id, Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
                  </div>
                </Group>

                {selectedCell && (
                  <Group title="Cell">
                    <div className="flex items-center gap-1">
                      <Button size="icon" className="h-8 w-8" variant={selectedCell.bold ? "default" : "outline"} onClick={() => updateCell({ bold: !selectedCell.bold })}><Bold className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={selectedCell.italic ? "default" : "outline"} onClick={() => updateCell({ italic: !selectedCell.italic })}><Italic className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={selectedCell.underline ? "default" : "outline"} onClick={() => updateCell({ underline: !selectedCell.underline })}><Underline className="h-3.5 w-3.5" /></Button>
                      <Separator orientation="vertical" className="h-6 mx-1" />
                      <Button size="icon" className="h-8 w-8" variant={(selectedCell.align ?? "left") === "left" ? "default" : "outline"} onClick={() => updateCell({ align: "left" })}><AlignLeft className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={selectedCell.align === "center" ? "default" : "outline"} onClick={() => updateCell({ align: "center" })}><AlignCenter className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={selectedCell.align === "right" ? "default" : "outline"} onClick={() => updateCell({ align: "right" })}><AlignRight className="h-3.5 w-3.5" /></Button>
                      <Separator orientation="vertical" className="h-6 mx-1" />
                      <Input className="h-8 w-12 p-1" type="color" value={selectedCell.bgColor ?? "#ffffff"} onChange={e => updateCell({ bgColor: e.target.value })} title="Cell background" />
                      <Button size="icon" className="h-8 w-8" variant="outline" onClick={() => updateCell({ locked: !selectedCell.locked })} title={selectedCell.locked ? "Locked for staff" : "Editable by staff"}>
                        {selectedCell.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </Group>
                )}
              </div>
            )}
          </TabsContent>

          {/* ---- Styling ---- */}
          <TabsContent value="style" className="m-0 border-b bg-background">
            <div className="flex items-start gap-0 divide-x overflow-x-auto py-3">
              <Group title="Color palette" hint="Palette ရွေးလိုက်သည်နှင့် canvas ပေါ်တွင် ချက်ချင်း ပြောင်းလဲသွားပါမည်။">
                <div className="flex items-center gap-3 flex-wrap">
                  {PALETTES.map(p => (
                    <Tooltip key={p.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onChange({ ...value, palette: p.id })}
                          data-no-lift
                          className={`relative h-9 w-9 rounded-full border-2 overflow-hidden transition ${value.palette === p.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/60"}`}
                        >
                          <span className="absolute inset-0" style={{ background: p.primary }} />
                          <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: p.accent }} />
                          <span className="absolute bottom-0 inset-x-0 h-1/3" style={{ background: p.surface }} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">{p.name}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </Group>

              <Group title="Border">
                <div className="w-20"><Label className="text-[10px]">Size</Label><Input className="h-8" type="number" min={0} max={5} value={value.border.size} onChange={e => onChange({ ...value, border: { ...value.border, size: Number(e.target.value) || 0 } })} /></div>
                <div className="w-28">
                  <Label className="text-[10px]">Style</Label>
                  <Select value={value.border.style} onValueChange={(v: any) => onChange({ ...value, border: { ...value.border, style: v } })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Solid</SelectItem>
                      <SelectItem value="dashed">Dashed</SelectItem>
                      <SelectItem value="dotted">Dotted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-16"><Label className="text-[10px]">Color</Label><Input className="h-8 p-1" type="color" value={value.border.color} onChange={e => onChange({ ...value, border: { ...value.border, color: e.target.value } })} /></div>
              </Group>

              {value.branding.freeLetterhead && (
                <>
                  <Group title="Header text style">
                    <div className="w-36"><Label className="text-[10px]">Font family</Label><Input className="h-8" placeholder="Georgia, serif" value={value.branding.headerBox?.fontFamily ?? ""} onChange={e => updateHeaderBox({ fontFamily: e.target.value || undefined })} /></div>
                    <div className="w-16"><Label className="text-[10px]">Size</Label><Input className="h-8" type="number" value={value.branding.headerBox?.fontSize ?? 22} onChange={e => updateHeaderBox({ fontSize: Number(e.target.value) || 22 })} /></div>
                    <div className="w-14"><Label className="text-[10px]">Color</Label><Input className="h-8 p-1" type="color" value={value.branding.headerBox?.color ?? "#0c2340"} onChange={e => updateHeaderBox({ color: e.target.value })} /></div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" className="h-8 w-8" variant={value.branding.headerBox?.bold ? "default" : "outline"} onClick={() => updateHeaderBox({ bold: !value.branding.headerBox?.bold })}><Bold className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={value.branding.headerBox?.italic ? "default" : "outline"} onClick={() => updateHeaderBox({ italic: !value.branding.headerBox?.italic })}><Italic className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={value.branding.headerBox?.underline ? "default" : "outline"} onClick={() => updateHeaderBox({ underline: !value.branding.headerBox?.underline })}><Underline className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={(value.branding.headerBox?.align ?? "left") === "left" ? "default" : "outline"} onClick={() => updateHeaderBox({ align: "left" })}><AlignLeft className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={value.branding.headerBox?.align === "center" ? "default" : "outline"} onClick={() => updateHeaderBox({ align: "center" })}><AlignCenter className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={value.branding.headerBox?.align === "right" ? "default" : "outline"} onClick={() => updateHeaderBox({ align: "right" })}><AlignRight className="h-3.5 w-3.5" /></Button>
                    </div>
                  </Group>
                  <Group title="Footer text style">
                    <div className="w-36"><Label className="text-[10px]">Font family</Label><Input className="h-8" placeholder="Inter, sans-serif" value={value.branding.footerBox?.fontFamily ?? ""} onChange={e => updateFooterBox({ fontFamily: e.target.value || undefined })} /></div>
                    <div className="w-16"><Label className="text-[10px]">Size</Label><Input className="h-8" type="number" value={value.branding.footerBox?.fontSize ?? 11} onChange={e => updateFooterBox({ fontSize: Number(e.target.value) || 11 })} /></div>
                    <div className="w-14"><Label className="text-[10px]">Color</Label><Input className="h-8 p-1" type="color" value={value.branding.footerBox?.color ?? "#2d8a9e"} onChange={e => updateFooterBox({ color: e.target.value })} /></div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" className="h-8 w-8" variant={value.branding.footerBox?.bold ? "default" : "outline"} onClick={() => updateFooterBox({ bold: !value.branding.footerBox?.bold })}><Bold className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={value.branding.footerBox?.italic ? "default" : "outline"} onClick={() => updateFooterBox({ italic: !value.branding.footerBox?.italic })}><Italic className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={value.branding.footerBox?.underline ? "default" : "outline"} onClick={() => updateFooterBox({ underline: !value.branding.footerBox?.underline })}><Underline className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={(value.branding.footerBox?.align ?? "left") === "left" ? "default" : "outline"} onClick={() => updateFooterBox({ align: "left" })}><AlignLeft className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={value.branding.footerBox?.align === "center" ? "default" : "outline"} onClick={() => updateFooterBox({ align: "center" })}><AlignCenter className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" className="h-8 w-8" variant={value.branding.footerBox?.align === "right" ? "default" : "outline"} onClick={() => updateFooterBox({ align: "right" })}><AlignRight className="h-3.5 w-3.5" /></Button>
                    </div>
                  </Group>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ================= WORKSPACE ================= */}
        <div className="flex items-stretch">
          {/* Canvas */}
          <div className="flex-1 min-w-0 flex flex-col bg-muted/30">
            {/* Zoom bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-background/70">
              <span className="text-xs text-muted-foreground">
                {value.page.size} · {value.page.orientation === "portrait" ? "Portrait" : "Landscape"}
              </span>
              <Hint>Cell ကို နှိပ်ပြီး တိုက်ရိုက် စာရိုက်နိုင်ပါသည်။ Table ကို ရွှေ့ရန် ဘယ်ဘက်အပေါ်ထောင့်ရှိ <strong>:::</strong> handle ကို ဖိဆွဲပါ။ ဘေးနှစ်ဖက် bar ဖြင့် အကျယ်ချိန်ပါ (Margin အတွင်း၌သာ ရွှေ့နိုင်သည်)။</Hint>
              <div className="ml-auto flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2)))} title="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
                <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(2)))} title="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" className="h-8" onClick={fitToScreen}><Maximize2 className="h-3.5 w-3.5 mr-1" />Fit</Button>
              </div>
            </div>

            <div ref={scrollAreaRef} className="overflow-auto p-6 max-h-[calc(100vh-14rem)]">
              <div style={{ width: pageDims.width * zoom, minHeight: pageDims.height * zoom }} className="mx-auto">
                <div ref={previewContainerRef} style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: pageDims.width }}>
                  <TemplateCanvas
                    template={value}
                    editable
                    allowLockedEdit
                    scale={zoom}
                    showPageBreaks
                    selectedCellId={selected?.cellId ?? null}
                    onCellClick={onSelectCell}
                    onCellChange={onCellChange}
                    onColWidthChange={updateColWidth}
                    onRowHeightChange={updateRowHeight}
                    dragCardId={dragCardId}
                    onCardDragStart={setDragCardId}
                    onCardDragEnd={() => setDragCardId(null)}
                    onCardReorder={reorderCards}
                    renderOverlay={() => (
                      <>
                        {/* Watermark interactive */}
                        {(value.branding.watermark.text || value.branding.watermark.imageUrl) && (
                          <Rnd
                            bounds="parent"
                            size={{ width: value.branding.watermark.width ?? 400, height: value.branding.watermark.height ?? 200 }}
                            position={{ x: value.branding.watermark.x ?? 0, y: value.branding.watermark.y ?? 0 }}
                            onDragStop={(_, d) => updateWatermark({ x: d.x, y: d.y })}
                            onResizeStop={(_, __, ref, ___, pos) => updateWatermark({ width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
                            style={{ zIndex: 1, border: "1px dashed rgba(0,0,0,0.15)", pointerEvents: "auto" }}
                          >
                            <div className="w-full h-full" />
                          </Rnd>
                        )}
                        {/* Free letterhead pieces interactive */}
                        {value.branding.freeLetterhead && value.branding.logoUrl && value.branding.logoBox && (
                          <Rnd
                            bounds="parent"
                            size={{ width: value.branding.logoBox.width, height: value.branding.logoBox.height }}
                            position={{ x: value.branding.logoBox.x, y: value.branding.logoBox.y }}
                            onDragStop={(_, d) => updateLogoBox({ x: d.x, y: d.y })}
                            onResizeStop={(_, __, ref, ___, pos) => updateLogoBox({ width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
                            style={{ zIndex: 20, outline: "1px dashed hsl(var(--primary) / 0.4)" }}
                          >
                            <div className="w-full h-full" />
                          </Rnd>
                        )}
                        {value.branding.freeLetterhead && value.branding.headerText && value.branding.headerBox && (
                          <Rnd
                            bounds="parent"
                            size={{ width: value.branding.headerBox.width, height: value.branding.headerBox.height }}
                            position={{ x: value.branding.headerBox.x, y: value.branding.headerBox.y }}
                            onDragStop={(_, d) => updateHeaderBox({ x: d.x, y: d.y })}
                            onResizeStop={(_, __, ref, ___, pos) => updateHeaderBox({ width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
                            style={{ zIndex: 20, outline: "1px dashed hsl(var(--primary) / 0.4)" }}
                          >
                            <div className="w-full h-full" />
                          </Rnd>
                        )}
                        {value.branding.freeLetterhead && value.letterheadFooterText && value.branding.footerBox && (
                          <Rnd
                            bounds="parent"
                            size={{ width: value.branding.footerBox.width, height: value.branding.footerBox.height }}
                            position={{ x: value.branding.footerBox.x, y: value.branding.footerBox.y }}
                            onDragStop={(_, d) => updateFooterBox({ x: d.x, y: d.y })}
                            onResizeStop={(_, __, ref, ___, pos) => updateFooterBox({ width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
                            style={{ zIndex: 20, outline: "1px dashed hsl(var(--primary) / 0.4)" }}
                          >
                            <div className="w-full h-full" />
                          </Rnd>
                        )}
                        {/* Free-positioned tables interactive — Rnd wraps the actual rendered table so its outline matches. */}
                        {value.cards.filter(c => c.free).map(card => {
                          const measured = cardHeights[card.id] ?? Math.max(40, (card.rows.length * 32) + 32);
                          const isSel = selectedCardId === card.id;
                          return (
                            <Rnd
                              key={`free-${card.id}`}
                              bounds="parent"
                              size={{ width: card.width ?? 600, height: measured }}
                              position={{ x: card.x ?? marginLeft, y: card.y ?? marginTop }}
                              enableResizing={{ left: true, right: true, top: false, bottom: false, topLeft: false, topRight: false, bottomLeft: false, bottomRight: false }}
                              dragHandleClassName="lp-drag-handle"
                              onDragStop={(_, d) => updateCardBox(card.id, { x: d.x, y: d.y })}
                              onResizeStop={(_, __, ref, ___, pos) => updateCardBox(card.id, { width: parseInt(ref.style.width), x: pos.x, y: pos.y })}
                              resizeHandleStyles={{
                                left: { pointerEvents: "auto", width: 8, left: -4, cursor: "ew-resize", background: isSel ? "hsl(var(--primary) / 0.18)" : "transparent" },
                                right: { pointerEvents: "auto", width: 8, right: -4, cursor: "ew-resize", background: isSel ? "hsl(var(--primary) / 0.18)" : "transparent" },
                              }}
                              style={{
                                zIndex: 15,
                                outline: isSel ? "1.5px solid hsl(var(--primary) / 0.7)" : "1px dashed hsl(var(--primary) / 0.18)",
                                pointerEvents: "none",
                              }}
                            >
                              {/* Body stays click-through so cells underneath stay editable;
                                  only the grip handle and the side resize bars capture the mouse. */}
                              <div className="group w-full h-full relative" style={{ pointerEvents: "none" }}>
                                {/* Contextual toolbar above the selected table */}
                                {isSel && (
                                  <div
                                    className="absolute -top-9 left-6 flex items-center gap-0.5 rounded-md border bg-popover px-1 py-0.5 shadow-md"
                                    style={{ pointerEvents: "auto" }}
                                  >
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Add row" onClick={() => addRow(card.id)}><Rows3 className="h-3 w-3" /></Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Delete last row" disabled={card.rows.length <= 1} onClick={() => removeRow(card.id, card.rows[card.rows.length - 1].id)}><Trash2 className="h-3 w-3" /></Button>
                                    <Separator orientation="vertical" className="h-4 mx-0.5" />
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Add column" disabled={card.columns >= 8} onClick={() => setCardColumns(card.id, Math.min(8, card.columns + 1))}><Columns3 className="h-3 w-3" /></Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" title="Delete column" disabled={card.columns <= 1} onClick={() => setCardColumns(card.id, Math.max(1, card.columns - 1))}><Trash2 className="h-3 w-3 rotate-90" /></Button>
                                    {selectedCell && selected?.cardId === card.id && (
                                      <>
                                        <Separator orientation="vertical" className="h-4 mx-0.5" />
                                        <input
                                          type="color"
                                          className="h-5 w-6 cursor-pointer rounded border bg-transparent p-0"
                                          value={selectedCell.bgColor ?? "#ffffff"}
                                          onChange={e => updateCell({ bgColor: e.target.value })}
                                          title="Cell background"
                                        />
                                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Align left" onClick={() => updateCell({ align: "left" })}><AlignLeft className="h-3 w-3" /></Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Align center" onClick={() => updateCell({ align: "center" })}><AlignCenter className="h-3 w-3" /></Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" title="Align right" onClick={() => updateCell({ align: "right" })}><AlignRight className="h-3 w-3" /></Button>
                                      </>
                                    )}
                                    <Separator orientation="vertical" className="h-4 mx-0.5" />
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="Delete table" onClick={() => removeCard(card.id)}><Trash2 className="h-3 w-3" /></Button>
                                  </div>
                                )}
                                {/* Subtle hover drag handle */}
                                <div
                                  className={`lp-drag-handle absolute -top-3 -left-3 flex h-6 w-6 items-center justify-center rounded-md border bg-background/95 shadow-sm transition-opacity ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                                  style={{ pointerEvents: "auto", cursor: "move" }}
                                  title="Drag to move"
                                  onMouseDown={() => { setSelectedCardId(card.id); setSelectedFreeId(null); }}
                                >
                                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              </div>
                            </Rnd>
                          );
                        })}


                        {/* Free elements interactive */}
                        {(value.freeElements ?? []).map(el => (
                          <Rnd
                            key={el.id}
                            bounds="parent"
                            size={{ width: el.width, height: el.height }}
                            position={{ x: el.x, y: el.y }}
                            onDragStop={(_, d) => updateFree(el.id, { x: d.x, y: d.y })}
                            onResizeStop={(_, __, ref, ___, pos) => updateFree(el.id, { width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
                            onMouseDown={() => { setSelectedFreeId(el.id); setSelected(null); setSelectedCardId(null); }}
                            style={{ zIndex: (el.zIndex ?? 5) + 10, outline: selectedFreeId === el.id ? "2px solid hsl(var(--primary))" : "1px dashed rgba(0,0,0,0.18)" }}
                          >
                            <div className="w-full h-full pointer-events-none" style={{ transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}>
                              {el.type === "text" && (
                                <div style={{ width: "100%", height: "100%", fontSize: el.fontSize ?? 14, color: el.color, fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : undefined, textDecoration: el.underline ? "underline" : undefined, textAlign: el.align ?? "left", whiteSpace: "pre-wrap", padding: 2 }}>{el.text}</div>
                              )}
                              {el.type === "image" && el.imageUrl && (
                                <img src={el.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                              )}
                              {el.type === "image" && !el.imageUrl && (
                                <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground">No image</div>
                              )}
                              {el.type === "shape" && el.shape !== "line" && (
                                <div style={{ width: "100%", height: "100%", background: el.bgColor ?? "transparent", border: `${el.borderWidth ?? 1}px solid ${el.borderColor ?? "#000"}`, borderRadius: el.shape === "circle" ? "50%" : 0 }} />
                              )}
                              {el.type === "shape" && el.shape === "line" && (
                                <div style={{ width: "100%", height: el.borderWidth ?? 2, background: el.borderColor ?? "#000", marginTop: (el.height / 2) - ((el.borderWidth ?? 2) / 2) }} />
                              )}
                              {el.type === "icon" && (() => {
                                const Map: any = { check: Check, cross: XIcon, bullet: CircleIcon, star: Star, arrow: ArrowRight };
                                const Icon = Map[el.icon ?? "check"];
                                return <Icon style={{ width: "100%", height: "100%", color: el.color ?? "#000" }} />;
                              })()}
                            </div>
                          </Rnd>
                        ))}
                      </>
                    )}
                  />
                </div>
              </div>

              {/* Page strip below the current page */}
              {typeof pageCount === "number" && pageCount > 0 && onAddPage && onSelectPage && (
                <div className="mx-auto mt-6 pt-4 border-t border-dashed" style={{ width: pageDims.width * zoom }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {Array.from({ length: pageCount }, (_, i) => (
                      <div key={i} className="flex items-center gap-0.5">
                        <Button size="sm" variant={i === (pageIdx ?? 0) ? "default" : "outline"} onClick={() => onSelectPage(i)}>Page {i + 1}</Button>
                        {pageCount > 1 && onDeletePage && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDeletePage(i)} title="Delete page"><Trash2 className="h-3 w-3" /></Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button onClick={onAddPage} variant="outline" className="w-full mt-3 border-dashed">
                    <Plus className="h-4 w-4 mr-2" /> Add new page below
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ============ RIGHT PROPERTIES PANEL ============ */}
          {propsPanelOpen && (
            <aside className="w-[300px] shrink-0 border-l bg-background overflow-y-auto max-h-[calc(100vh-11rem)]">
              {selectedFree && (
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize flex items-center gap-1.5"><Layers className="h-4 w-4 text-primary" />{selectedFree.type} properties</h3>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeFree(selectedFree.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Separator />
                  {selectedFree.type === "text" && (
                    <>
                      <Textarea rows={3} value={selectedFree.text ?? ""} onChange={e => updateFree(selectedFree.id, { text: e.target.value })} />
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">Font size</Label><Input className="h-8" type="number" value={selectedFree.fontSize ?? 14} onChange={e => updateFree(selectedFree.id, { fontSize: Number(e.target.value) || 14 })} /></div>
                        <div><Label className="text-xs">Color</Label><Input className="h-8 p-1" type="color" value={selectedFree.color ?? "#000000"} onChange={e => updateFree(selectedFree.id, { color: e.target.value })} /></div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" className="h-8 w-8" variant={selectedFree.bold ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { bold: !selectedFree.bold })}><Bold className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" className="h-8 w-8" variant={selectedFree.italic ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { italic: !selectedFree.italic })}><Italic className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" className="h-8 w-8" variant={selectedFree.underline ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { underline: !selectedFree.underline })}><Underline className="h-3.5 w-3.5" /></Button>
                        <Separator orientation="vertical" className="h-8 mx-1" />
                        <Button size="icon" className="h-8 w-8" variant={(selectedFree.align ?? "left") === "left" ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { align: "left" })}><AlignLeft className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" className="h-8 w-8" variant={selectedFree.align === "center" ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { align: "center" })}><AlignCenter className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" className="h-8 w-8" variant={selectedFree.align === "right" ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { align: "right" })}><AlignRight className="h-3.5 w-3.5" /></Button>
                      </div>
                    </>
                  )}
                  {selectedFree.type === "image" && (
                    <ImageUpload label="Image" value={selectedFree.imageUrl} onChange={url => updateFree(selectedFree.id, { imageUrl: url })} placeholder="Upload image" recommendation="Any size, < 2MB" />
                  )}
                  {selectedFree.type === "shape" && (
                    <>
                      <div>
                        <Label className="text-xs">Shape</Label>
                        <Select value={selectedFree.shape ?? "rect"} onValueChange={(v: any) => updateFree(selectedFree.id, { shape: v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rect">Rectangle</SelectItem>
                            <SelectItem value="circle">Circle</SelectItem>
                            <SelectItem value="line">Line</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">Fill</Label><Input className="h-8 p-1" type="color" value={selectedFree.bgColor ?? "#ffffff"} onChange={e => updateFree(selectedFree.id, { bgColor: e.target.value })} /></div>
                        <div><Label className="text-xs">Stroke</Label><Input className="h-8 p-1" type="color" value={selectedFree.borderColor ?? "#000000"} onChange={e => updateFree(selectedFree.id, { borderColor: e.target.value })} /></div>
                      </div>
                      <div><Label className="text-xs">Stroke width</Label><Input className="h-8" type="number" value={selectedFree.borderWidth ?? 1} onChange={e => updateFree(selectedFree.id, { borderWidth: Number(e.target.value) || 0 })} /></div>
                    </>
                  )}
                  {selectedFree.type === "icon" && (
                    <>
                      <div>
                        <Label className="text-xs">Icon</Label>
                        <Select value={selectedFree.icon ?? "check"} onValueChange={(v: any) => updateFree(selectedFree.id, { icon: v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="check">Check</SelectItem>
                            <SelectItem value="cross">Cross</SelectItem>
                            <SelectItem value="bullet">Bullet</SelectItem>
                            <SelectItem value="star">Star</SelectItem>
                            <SelectItem value="arrow">Arrow</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Color</Label><Input className="h-8 p-1" type="color" value={selectedFree.color ?? "#000000"} onChange={e => updateFree(selectedFree.id, { color: e.target.value })} /></div>
                    </>
                  )}
                  <div>
                    <Label className="text-xs">Rotation ({selectedFree.rotation ?? 0}°)</Label>
                    <Slider className="mt-3" min={-180} max={180} step={1} value={[selectedFree.rotation ?? 0]} onValueChange={([v]) => updateFree(selectedFree.id, { rotation: v })} />
                  </div>
                </div>
              )}

              {!selectedFree && selectedCell && (
                <div className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-1.5"><Table2 className="h-4 w-4 text-primary" />Cell properties</h3>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSelected(null); setSelectedCardId(null); }} title="Close"><XIcon className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1">Locked for staff <Hint>Locked cell များကို Staff မပြင်နိုင်ပါ။ Admin သည် editor ထဲတွင် အမြဲ ပြင်နိုင်ပါသည်။</Hint></Label>
                    <Switch checked={selectedCell.locked} onCheckedChange={v => updateCell({ locked: v })} />
                  </div>
                  <div>
                    <Label className="text-xs">Content</Label>
                    <Textarea rows={2} value={selectedCell.value} onChange={e => updateCell({ value: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Prefix marker</Label>
                    <Select value={selectedCell.prefix ?? "none"} onValueChange={(v: any) => updateCell({ prefix: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="bullet">• Bullet</SelectItem>
                        <SelectItem value="number">1. Number</SelectItem>
                        <SelectItem value="checkbox">☐ Checkbox</SelectItem>
                        <SelectItem value="radio">○ Radio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">Dropdown options <Hint>တစ်ကြောင်းလျှင် တစ်ခုစီ ရေးပါ။ ဗလာထားလျှင် free text ဖြစ်ပါမည်။</Hint></Label>
                    <Textarea rows={3} value={optionsDraft}
                      onChange={e => setOptionsDraft(e.target.value)}
                      onBlur={() => {
                        const opts = optionsDraft.split("\n").map(s => s.trim()).filter(Boolean);
                        updateCell({ options: opts.length ? opts : undefined });
                      }}
                      placeholder={"Present\nAbsent\nLate"} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Font size</Label><Input className="h-8" type="number" min={8} max={48} value={selectedCell.fontSize ?? 12} onChange={e => updateCell({ fontSize: Number(e.target.value) || 12 })} /></div>
                    <div><Label className="text-xs">Min size</Label><Input className="h-8" type="number" min={8} max={24} value={selectedCell.minFontSize ?? 12} onChange={e => updateCell({ minFontSize: Number(e.target.value) || 12 })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Text color</Label><Input className="h-8 p-1" type="color" value={selectedCell.color ?? "#000000"} onChange={e => updateCell({ color: e.target.value })} /></div>
                    <div><Label className="text-xs">Cell color</Label><Input className="h-8 p-1" type="color" value={selectedCell.bgColor ?? "#ffffff"} onChange={e => updateCell({ bgColor: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" className="h-8 w-8" variant={selectedCell.bold ? "default" : "outline"} onClick={() => updateCell({ bold: !selectedCell.bold })}><Bold className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" className="h-8 w-8" variant={selectedCell.italic ? "default" : "outline"} onClick={() => updateCell({ italic: !selectedCell.italic })}><Italic className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" className="h-8 w-8" variant={selectedCell.underline ? "default" : "outline"} onClick={() => updateCell({ underline: !selectedCell.underline })}><Underline className="h-3.5 w-3.5" /></Button>
                    <Separator orientation="vertical" className="h-8 mx-1" />
                    <Button size="icon" className="h-8 w-8" variant={(selectedCell.align ?? "left") === "left" ? "default" : "outline"} onClick={() => updateCell({ align: "left" })}><AlignLeft className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" className="h-8 w-8" variant={selectedCell.align === "center" ? "default" : "outline"} onClick={() => updateCell({ align: "center" })}><AlignCenter className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" className="h-8 w-8" variant={selectedCell.align === "right" ? "default" : "outline"} onClick={() => updateCell({ align: "right" })}><AlignRight className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
