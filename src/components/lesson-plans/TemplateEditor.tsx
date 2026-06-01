import { useState, useMemo, useCallback } from "react";
import { Rnd } from "react-rnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Bold, Italic, Underline, Plus, Trash2, Lock, Unlock, Type, Image as ImageIcon, Square, Star, Layers, Check, X as XIcon, Circle as CircleIcon, ArrowRight } from "lucide-react";
import { TemplateCanvas } from "./TemplateCanvas";
import { ImageUpload } from "./ImageUpload";
import type { LessonPlanTemplate, Cell, FreeElement, FreeElementType } from "@/lib/lessonPlanTypes";
import { PALETTES } from "@/lib/lessonPlanDefaults";

interface Props {
  value: LessonPlanTemplate;
  onChange: (v: LessonPlanTemplate) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function TemplateEditor({ value, onChange }: Props) {
  const [selected, setSelected] = useState<{ cardId: string; rowId: string; cellId: string } | null>(null);
  const [selectedFreeId, setSelectedFreeId] = useState<string | null>(null);
  const [optionsDraft, setOptionsDraft] = useState<string>("");

  const selectedCell = useMemo(() => {
    if (!selected) return null;
    const card = value.cards.find(c => c.id === selected.cardId);
    const row = card?.rows.find(r => r.id === selected.rowId);
    return row?.cells.find(c => c.id === selected.cellId) ?? null;
  }, [selected, value]);

  const selectedFree = useMemo(() => value.freeElements?.find(e => e.id === selectedFreeId) ?? null, [selectedFreeId, value.freeElements]);

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
        // adjacent column compensates; do not allow edge resizing (first/last via this UI)
        if (colIdx <= 0 || colIdx >= c.columns - 1) return c;
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
    onChange({
      ...value,
      cards: [
        ...value.cards,
        {
          id: uid(),
          title: `Card ${value.cards.length + 1}`,
          columns: 2,
          colWidths: [50, 50],
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

  // Sync options draft when selecting cell
  const showOptionsBlock = selectedCell != null;
  const onSelectCell = (cardId: string, rowId: string, cellId: string) => {
    setSelected({ cardId, rowId, cellId });
    const card = value.cards.find(c => c.id === cardId);
    const row = card?.rows.find(r => r.id === rowId);
    const cell = row?.cells.find(c => c.id === cellId);
    setOptionsDraft((cell?.options ?? []).join("\n"));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
      {/* Left: controls (scrollable) */}
      <div className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pr-1">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Page</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Size</Label>
                <Select value={value.page.size} onValueChange={(v: any) => onChange({ ...value, page: { ...value.page, size: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Orientation</Label>
                <Select value={value.page.orientation} onValueChange={(v: any) => onChange({ ...value, page: { ...value.page, orientation: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Margin (mm)</Label>
              <Input type="number" min={4} max={40} value={value.page.margin}
                onChange={e => onChange({ ...value, page: { ...value.page, margin: Number(e.target.value) || 0 } })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Letterhead</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ImageUpload
              label="Logo image"
              value={value.branding.logoUrl}
              onChange={url => onChange({ ...value, branding: { ...value.branding, logoUrl: url } })}
              placeholder="Upload logo"
              recommendation="1200×300 px, PNG/JPG, < 2MB"
            />
            <div>
              <Label className="text-xs">Header text</Label>
              <Input value={value.branding.headerText ?? ""} onChange={e => onChange({ ...value, branding: { ...value.branding, headerText: e.target.value } })} />
            </div>
            <div>
              <Label className="text-xs">Footer text (below letterhead)</Label>
              <Textarea rows={2} value={value.letterheadFooterText} onChange={e => onChange({ ...value, letterheadFooterText: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Watermark</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Text</Label>
              <Input value={value.branding.watermark.text ?? ""} onChange={e => updateWatermark({ text: e.target.value })} />
            </div>
            <ImageUpload
              label="Watermark image"
              value={value.branding.watermark.imageUrl}
              onChange={url => updateWatermark({ imageUrl: url })}
              placeholder="Upload watermark"
              recommendation="800×800 px, transparent PNG, < 2MB"
            />
            <div>
              <Label className="text-xs">Opacity ({Math.round(value.branding.watermark.opacity * 100)}%)</Label>
              <Slider min={0} max={80} step={1} value={[value.branding.watermark.opacity * 100]}
                onValueChange={([v]) => updateWatermark({ opacity: v / 100 })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Width (px)</Label>
                <Input type="number" value={value.branding.watermark.width ?? 400} onChange={e => updateWatermark({ width: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label className="text-xs">Height (px)</Label>
                <Input type="number" value={value.branding.watermark.height ?? 200} onChange={e => updateWatermark({ height: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label className="text-xs">X</Label>
                <Input type="number" value={value.branding.watermark.x ?? 0} onChange={e => updateWatermark({ x: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label className="text-xs">Y</Label>
                <Input type="number" value={value.branding.watermark.y ?? 0} onChange={e => updateWatermark({ y: Number(e.target.value) || 0 })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Rotation ({value.branding.watermark.rotation ?? 0}°)</Label>
                <Slider min={-180} max={180} step={1} value={[value.branding.watermark.rotation ?? 0]}
                  onValueChange={([v]) => updateWatermark({ rotation: v })} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Tip: Drag the watermark directly on the preview to move/resize it.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Color Palette</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {PALETTES.map(p => (
                <button key={p.id}
                  onClick={() => onChange({ ...value, palette: p.id })}
                  className={`text-left rounded-md border p-2 hover:border-primary transition ${value.palette === p.id ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
                  <div className="flex gap-1 mb-1">
                    <span className="h-4 w-4 rounded-sm" style={{ background: p.primary }} />
                    <span className="h-4 w-4 rounded-sm" style={{ background: p.accent }} />
                    <span className="h-4 w-4 rounded-sm" style={{ background: p.surface }} />
                  </div>
                  <div className="text-[11px] font-medium">{p.name}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Border</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Size</Label>
                <Input type="number" min={0} max={5} value={value.border.size}
                  onChange={e => onChange({ ...value, border: { ...value.border, size: Number(e.target.value) || 0 } })} />
              </div>
              <div>
                <Label className="text-xs">Style</Label>
                <Select value={value.border.style} onValueChange={(v: any) => onChange({ ...value, border: { ...value.border, style: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="dashed">Dashed</SelectItem>
                    <SelectItem value="dotted">Dotted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Color</Label>
              <Input type="color" value={value.border.color} onChange={e => onChange({ ...value, border: { ...value.border, color: e.target.value } })} />
            </div>
          </CardContent>
        </Card>

        {/* Card structure controls */}
        {value.cards.map((card, idx) => (
          <Card key={card.id}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Card {idx + 1}</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => removeCard(card.id)} className="h-7 w-7 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input value={card.title} onChange={e => onChange({ ...value, cards: value.cards.map(c => c.id === card.id ? { ...c, title: e.target.value } : c) })} />
              <div>
                <Label className="text-xs">Columns</Label>
                <Input type="number" min={1} max={8} value={card.columns} onChange={e => setCardColumns(card.id, Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
              </div>
              {/* Inner column widths (skip first/last edge boundaries) */}
              {card.columns > 2 && (
                <div className="space-y-1">
                  <Label className="text-xs">Inner column widths %</Label>
                  {(card.colWidths ?? Array.from({ length: card.columns }, () => 100 / card.columns)).map((w, i) => (
                    i > 0 && i < card.columns - 1 ? (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] w-12">Col {i + 1}</span>
                        <Slider min={5} max={80} step={1} value={[w]} onValueChange={([v]) => updateColWidth(card.id, i, v)} className="flex-1" />
                        <span className="text-[10px] w-8 text-right">{Math.round(w)}</span>
                      </div>
                    ) : null
                  ))}
                </div>
              )}
              {/* Inner row heights (skip first/last) */}
              {card.rows.length > 2 && (
                <div className="space-y-1">
                  <Label className="text-xs">Inner row heights (px)</Label>
                  {card.rows.map((r, i) => (
                    i > 0 && i < card.rows.length - 1 ? (
                      <div key={r.id} className="flex items-center gap-2">
                        <span className="text-[10px] w-12">Row {i + 1}</span>
                        <Input type="number" min={20} max={300} value={r.height ?? 32}
                          onChange={e => updateRowHeight(card.id, r.id, Number(e.target.value) || 32)} className="h-7 text-xs" />
                      </div>
                    ) : null
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => addRow(card.id)}><Plus className="h-3 w-3 mr-1" />Row</Button>
                {card.rows.length > 1 && (
                  <Button size="sm" variant="outline" onClick={() => removeRow(card.id, card.rows[card.rows.length - 1].id)}>
                    <Trash2 className="h-3 w-3 mr-1" />Last row
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        <Button onClick={addCard} variant="outline" className="w-full"><Plus className="h-3 w-3 mr-1" />Add Card</Button>

        {/* Free elements */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" />Free Elements</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => addFree("text")}><Type className="h-3 w-3 mr-1" />Text</Button>
              <Button size="sm" variant="outline" onClick={() => addFree("image")}><ImageIcon className="h-3 w-3 mr-1" />Image</Button>
              <Button size="sm" variant="outline" onClick={() => addFree("shape")}><Square className="h-3 w-3 mr-1" />Shape</Button>
              <Button size="sm" variant="outline" onClick={() => addFree("icon")}><Star className="h-3 w-3 mr-1" />Icon</Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Click an element on the preview to edit. Drag/resize directly on the page.</p>
          </CardContent>
        </Card>

        {/* Selected free element */}
        {selectedFree && (
          <Card className="border-primary">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Selected: {selectedFree.type}</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => removeFree(selectedFree.id)} className="h-7 w-7 text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedFree.type === "text" && (
                <>
                  <Textarea rows={2} value={selectedFree.text ?? ""} onChange={e => updateFree(selectedFree.id, { text: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Font size</Label><Input type="number" value={selectedFree.fontSize ?? 14} onChange={e => updateFree(selectedFree.id, { fontSize: Number(e.target.value) || 14 })} /></div>
                    <div><Label className="text-xs">Color</Label><Input type="color" value={selectedFree.color ?? "#000000"} onChange={e => updateFree(selectedFree.id, { color: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant={selectedFree.bold ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { bold: !selectedFree.bold })}><Bold className="h-3 w-3" /></Button>
                    <Button size="sm" variant={selectedFree.italic ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { italic: !selectedFree.italic })}><Italic className="h-3 w-3" /></Button>
                    <Button size="sm" variant={selectedFree.underline ? "default" : "outline"} onClick={() => updateFree(selectedFree.id, { underline: !selectedFree.underline })}><Underline className="h-3 w-3" /></Button>
                  </div>
                  <div>
                    <Label className="text-xs">Align</Label>
                    <Select value={selectedFree.align ?? "left"} onValueChange={(v: any) => updateFree(selectedFree.id, { align: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
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
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rect">Rectangle</SelectItem>
                        <SelectItem value="circle">Circle</SelectItem>
                        <SelectItem value="line">Line</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Fill</Label><Input type="color" value={selectedFree.bgColor ?? "#ffffff"} onChange={e => updateFree(selectedFree.id, { bgColor: e.target.value })} /></div>
                    <div><Label className="text-xs">Stroke</Label><Input type="color" value={selectedFree.borderColor ?? "#000000"} onChange={e => updateFree(selectedFree.id, { borderColor: e.target.value })} /></div>
                  </div>
                  <div><Label className="text-xs">Stroke width</Label><Input type="number" value={selectedFree.borderWidth ?? 1} onChange={e => updateFree(selectedFree.id, { borderWidth: Number(e.target.value) || 0 })} /></div>
                </>
              )}
              {selectedFree.type === "icon" && (
                <>
                  <div>
                    <Label className="text-xs">Icon</Label>
                    <Select value={selectedFree.icon ?? "check"} onValueChange={(v: any) => updateFree(selectedFree.id, { icon: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="cross">Cross</SelectItem>
                        <SelectItem value="bullet">Bullet</SelectItem>
                        <SelectItem value="star">Star</SelectItem>
                        <SelectItem value="arrow">Arrow</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Color</Label><Input type="color" value={selectedFree.color ?? "#000000"} onChange={e => updateFree(selectedFree.id, { color: e.target.value })} /></div>
                </>
              )}
              <div>
                <Label className="text-xs">Rotation ({selectedFree.rotation ?? 0}°)</Label>
                <Slider min={-180} max={180} step={1} value={[selectedFree.rotation ?? 0]} onValueChange={([v]) => updateFree(selectedFree.id, { rotation: v })} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selected cell controls */}
        {showOptionsBlock && selectedCell && (
          <Card className="border-primary">
            <CardHeader className="pb-2"><CardTitle className="text-base">Selected Cell</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Locked (read-only for staff)</Label>
                <Switch checked={selectedCell.locked} onCheckedChange={v => updateCell({ locked: v })} />
              </div>
              <div>
                <Label className="text-xs">Content</Label>
                <Textarea rows={2} value={selectedCell.value} onChange={e => updateCell({ value: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Prefix marker</Label>
                <Select value={selectedCell.prefix ?? "none"} onValueChange={(v: any) => updateCell({ prefix: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label className="text-xs">Dropdown options (one per line — leaves blank for free text)</Label>
                <Textarea rows={3} value={optionsDraft}
                  onChange={e => setOptionsDraft(e.target.value)}
                  onBlur={() => {
                    const opts = optionsDraft.split("\n").map(s => s.trim()).filter(Boolean);
                    updateCell({ options: opts.length ? opts : undefined });
                  }}
                  placeholder="e.g.\nPresent\nAbsent\nLate" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Font size</Label><Input type="number" min={8} max={48} value={selectedCell.fontSize ?? 12} onChange={e => updateCell({ fontSize: Number(e.target.value) || 12 })} /></div>
                <div><Label className="text-xs">Min size</Label><Input type="number" min={8} max={24} value={selectedCell.minFontSize ?? 12} onChange={e => updateCell({ minFontSize: Number(e.target.value) || 12 })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Text color</Label><Input type="color" value={selectedCell.color ?? "#000000"} onChange={e => updateCell({ color: e.target.value })} /></div>
                <div><Label className="text-xs">Cell color</Label><Input type="color" value={selectedCell.bgColor ?? "#ffffff"} onChange={e => updateCell({ bgColor: e.target.value })} /></div>
              </div>
              <div>
                <Label className="text-xs">Align</Label>
                <Select value={selectedCell.align ?? "left"} onValueChange={(v: any) => updateCell({ align: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant={selectedCell.bold ? "default" : "outline"} onClick={() => updateCell({ bold: !selectedCell.bold })}><Bold className="h-3 w-3" /></Button>
                <Button size="sm" variant={selectedCell.italic ? "default" : "outline"} onClick={() => updateCell({ italic: !selectedCell.italic })}><Italic className="h-3 w-3" /></Button>
                <Button size="sm" variant={selectedCell.underline ? "default" : "outline"} onClick={() => updateCell({ underline: !selectedCell.underline })}><Underline className="h-3 w-3" /></Button>
                <Button size="sm" variant="outline" onClick={() => updateCell({ locked: !selectedCell.locked })}>
                  {selectedCell.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right: sticky preview */}
      <div className="lg:sticky lg:top-4">
        <div className="overflow-auto bg-muted/30 rounded-lg p-4 max-h-[calc(100vh-2rem)]">
          <p className="text-xs text-muted-foreground mb-2">Click a cell or element to edit. Drag the watermark or free elements directly.</p>
          <div style={{ transform: "scale(0.78)", transformOrigin: "top left" }}>
            <TemplateCanvas
              template={value}
              editable
              selectedCellId={selected?.cellId ?? null}
              onCellClick={onSelectCell}
              onCellChange={onCellChange}
              renderOverlay={(page) => (
                <>
                  {/* Watermark interactive */}
                  {(value.branding.watermark.text || value.branding.watermark.imageUrl) && (
                    <Rnd
                      bounds="parent"
                      size={{ width: value.branding.watermark.width ?? 400, height: value.branding.watermark.height ?? 200 }}
                      position={{ x: value.branding.watermark.x ?? 0, y: value.branding.watermark.y ?? 0 }}
                      onDragStop={(_, d) => updateWatermark({ x: d.x, y: d.y })}
                      onResizeStop={(_, __, ref, ___, pos) => updateWatermark({ width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
                      style={{ zIndex: 1, border: "1px dashed rgba(0,0,0,0.25)", pointerEvents: "auto" }}
                    >
                      <div className="w-full h-full" />
                    </Rnd>
                  )}
                  {/* Free elements interactive */}
                  {(value.freeElements ?? []).map(el => (
                    <Rnd
                      key={el.id}
                      bounds="parent"
                      size={{ width: el.width, height: el.height }}
                      position={{ x: el.x, y: el.y }}
                      onDragStop={(_, d) => updateFree(el.id, { x: d.x, y: d.y })}
                      onResizeStop={(_, __, ref, ___, pos) => updateFree(el.id, { width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: pos.x, y: pos.y })}
                      onMouseDown={() => setSelectedFreeId(el.id)}
                      style={{ zIndex: (el.zIndex ?? 5) + 10, outline: selectedFreeId === el.id ? "2px solid hsl(var(--primary))" : "1px dashed rgba(0,0,0,0.25)" }}
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
                          const ImportMap: any = require("lucide-react");
                          const Map: any = { check: ImportMap.Check, cross: ImportMap.X, bullet: ImportMap.Circle, star: ImportMap.Star, arrow: ImportMap.ArrowRight };
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
      </div>
    </div>
  );
}
