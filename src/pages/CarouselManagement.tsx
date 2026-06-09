import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Loader2, ArrowUp, ArrowDown, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useCarouselSettings,
  useCarouselSlides,
  useUpdateCarouselSettings,
  useUpsertSlide,
  useDeleteSlide,
  uploadSlideImage,
  type CarouselSlide,
} from "@/hooks/useCarousel";

export default function CarouselManagement() {
  const { data: settings, isLoading: sLoading } = useCarouselSettings();
  const { data: slides, isLoading: slLoading } = useCarouselSlides();
  const updateSettings = useUpdateCarouselSettings();
  const upsertSlide = useUpsertSlide();
  const deleteSlide = useDeleteSlide();
  const [uploading, setUploading] = useState(false);

  if (sLoading || slLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleAdd = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadSlideImage(file);
      const nextOrder = (slides?.length ?? 0) + 1;
      await upsertSlide.mutateAsync({ image_url: url, sort_order: nextOrder, active: true, link_enabled: false });
      toast({ title: "Slide added" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const move = async (slide: CarouselSlide, dir: -1 | 1) => {
    const list = [...(slides ?? [])];
    const idx = list.findIndex((s) => s.id === slide.id);
    const swap = list[idx + dir];
    if (!swap) return;
    await upsertSlide.mutateAsync({ id: slide.id, image_url: slide.image_url, sort_order: swap.sort_order });
    await upsertSlide.mutateAsync({ id: swap.id, image_url: swap.image_url, sort_order: slide.sort_order });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold">Carousel Slider Management</h1>
        <p className="text-sm text-muted-foreground">Configure the global promotional banner shown across the app.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable carousel</Label>
            <Switch
              checked={!!settings?.enabled}
              onCheckedChange={(v) => updateSettings.mutate({ enabled: v })}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Position</Label>
              <Select
                value={settings?.position ?? "top"}
                onValueChange={(v) => updateSettings.mutate({ position: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="middle">Middle</SelectItem>
                  <SelectItem value="bottom">Bottom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Animation style</Label>
              <Select
                value={settings?.animation_style ?? "continuous"}
                onValueChange={(v) => updateSettings.mutate({ animation_style: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="continuous">Continuous Scroll</SelectItem>
                  <SelectItem value="fade">Fade</SelectItem>
                  <SelectItem value="slide-snap">Slide Snap</SelectItem>
                  <SelectItem value="pop">Pop</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Animation speed (seconds)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                defaultValue={settings?.animation_speed_seconds ?? 5}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (n > 0) updateSettings.mutate({ animation_speed_seconds: n });
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Slides ({slides?.length ?? 0})</CardTitle>
          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAdd(f);
                e.currentTarget.value = "";
              }}
            />
            <Button asChild disabled={uploading}>
              <span className="cursor-pointer">
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Slide
              </span>
            </Button>
          </label>
        </CardHeader>
        <CardContent className="space-y-4">
          {(slides ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
              No slides yet. Upload a 21:9 image to get started.
            </div>
          ) : (
            (slides ?? []).map((slide, idx) => (
              <SlideEditor
                key={slide.id}
                slide={slide}
                isFirst={idx === 0}
                isLast={idx === (slides ?? []).length - 1}
                onSave={(patch) => upsertSlide.mutateAsync({ ...patch, id: slide.id, image_url: slide.image_url })}
                onDelete={() => deleteSlide.mutate(slide.id)}
                onMove={(d) => move(slide, d)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SlideEditor({
  slide,
  isFirst,
  isLast,
  onSave,
  onDelete,
  onMove,
}: {
  slide: CarouselSlide;
  isFirst: boolean;
  isLast: boolean;
  onSave: (patch: Partial<CarouselSlide>) => Promise<void>;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [linkEnabled, setLinkEnabled] = useState(slide.link_enabled);
  const [linkUrl, setLinkUrl] = useState(slide.link_url ?? "");
  const [active, setActive] = useState(slide.active);
  const [start, setStart] = useState<Date | undefined>(slide.start_date ? new Date(slide.start_date) : undefined);
  const [end, setEnd] = useState<Date | undefined>(slide.end_date ? new Date(slide.end_date) : undefined);

  const save = async (patch: Partial<CarouselSlide>) => {
    try {
      await onSave(patch);
      toast({ title: "Saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="aspect-[21/9] w-full rounded-md overflow-hidden bg-muted">
          <img src={slide.image_url} alt="" className="aspect-[21/9] w-full h-full object-cover" />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={(v) => { setActive(v); save({ active: v }); }} />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" disabled={isFirst} onClick={() => onMove(-1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={isLast} onClick={() => onMove(1)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={linkEnabled}
              onCheckedChange={(v) => { setLinkEnabled(v); save({ link_enabled: v, link_url: v ? linkUrl : null }); }}
            />
            <Label>Enable external link</Label>
          </div>
          {linkEnabled && (
            <Input
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onBlur={() => save({ link_url: linkUrl, link_enabled: true })}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <DateField label="Start date" value={start} onChange={(d) => { setStart(d); save({ start_date: d ? format(d, "yyyy-MM-dd") : null }); }} />
            <DateField label="End date" value={end} onChange={(d) => { setEnd(d); save({ end_date: d ? format(d, "yyyy-MM-dd") : null }); }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value?: Date; onChange: (d?: Date) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}>
            <CalendarIcon className="h-4 w-4 mr-2" />
            {value ? format(value, "PPP") : <span>Any</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} />
          {value && (
            <div className="p-2 border-t">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(undefined)}>Clear</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
