import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bold, Italic, Underline, Plus, Trash2, Lock, Unlock } from "lucide-react";
import { TemplateCanvas } from "./TemplateCanvas";
import type { LessonPlanTemplate, Cell } from "@/lib/lessonPlanTypes";
import { PALETTES } from "@/lib/lessonPlanDefaults";

interface Props {
  value: LessonPlanTemplate;
  onChange: (v: LessonPlanTemplate) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function TemplateEditor({ value, onChange }: Props) {
  const [selected, setSelected] = useState<{ cardId: string; rowId: string; cellId: string } | null>(null);

  const selectedCell = useMemo(() => {
    if (!selected) return null;
    const card = value.cards.find(c => c.id === selected.cardId);
    const row = card?.rows.find(r => r.id === selected.rowId);
    return row?.cells.find(c => c.id === selected.cellId) ?? null;
  }, [selected, value]);

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
          id: uid(), value: "", locked: false, fontSize: 12, minFontSize: 12, align: "left",
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
          while (cells.length < columns) cells.push({ id: uid(), value: "", locked: false, fontSize: 12, minFontSize: 12, align: "left" });
          while (cells.length > columns) cells.pop();
          return { ...r, cells };
        });
        return { ...c, columns, rows };
      }),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* Left: controls */}
      <div className="space-y-4">
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
            <div>
              <Label className="text-xs">Logo URL</Label>
              <Input value={value.branding.logoUrl ?? ""} onChange={e => onChange({ ...value, branding: { ...value.branding, logoUrl: e.target.value } })} placeholder="https://..." />
            </div>
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
              <Input value={value.branding.watermark.text ?? ""} onChange={e => onChange({ ...value, branding: { ...value.branding, watermark: { ...value.branding.watermark, text: e.target.value } } })} />
            </div>
            <div>
              <Label className="text-xs">Image URL</Label>
              <Input value={value.branding.watermark.imageUrl ?? ""} onChange={e => onChange({ ...value, branding: { ...value.branding, watermark: { ...value.branding.watermark, imageUrl: e.target.value } } })} />
            </div>
            <div>
              <Label className="text-xs">Opacity ({Math.round(value.branding.watermark.opacity * 100)}%)</Label>
              <Slider min={0} max={50} step={1} value={[value.branding.watermark.opacity * 100]}
                onValueChange={([v]) => onChange({ ...value, branding: { ...value.branding, watermark: { ...value.branding.watermark, opacity: v / 100 } } })} />
            </div>
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
            <CardHeader className="pb-2"><CardTitle className="text-base">Card {idx + 1}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input value={card.title} onChange={e => onChange({ ...value, cards: value.cards.map(c => c.id === card.id ? { ...c, title: e.target.value } : c) })} />
              <div>
                <Label className="text-xs">Columns</Label>
                <Input type="number" min={1} max={6} value={card.columns} onChange={e => setCardColumns(card.id, Math.max(1, Math.min(6, Number(e.target.value) || 1)))} />
              </div>
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

        {/* Selected cell controls */}
        {selectedCell && (
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Font size</Label>
                  <Input type="number" min={8} max={48} value={selectedCell.fontSize ?? 12} onChange={e => updateCell({ fontSize: Number(e.target.value) || 12 })} />
                </div>
                <div>
                  <Label className="text-xs">Min size</Label>
                  <Input type="number" min={8} max={24} value={selectedCell.minFontSize ?? 12} onChange={e => updateCell({ minFontSize: Number(e.target.value) || 12 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Text color</Label>
                  <Input type="color" value={selectedCell.color ?? "#000000"} onChange={e => updateCell({ color: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Cell color</Label>
                  <Input type="color" value={selectedCell.bgColor ?? "#ffffff"} onChange={e => updateCell({ bgColor: e.target.value })} />
                </div>
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

      {/* Right: preview */}
      <div className="overflow-auto bg-muted/30 rounded-lg p-4 max-h-[80vh]">
        <p className="text-xs text-muted-foreground mb-2">Click a cell to edit its style. Locked cells are read-only for staff.</p>
        <div style={{ transform: "scale(0.85)", transformOrigin: "top left" }}>
          <TemplateCanvas
            template={value}
            editable
            selectedCellId={selected?.cellId ?? null}
            onCellClick={(cardId, rowId, cellId) => setSelected({ cardId, rowId, cellId })}
            onCellChange={onCellChange}
          />
        </div>
      </div>
    </div>
  );
}
