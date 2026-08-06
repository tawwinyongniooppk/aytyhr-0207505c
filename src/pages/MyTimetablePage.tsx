import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CalendarDays, Download, Mail, Plus, Save, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/components/ui/use-toast";
import { TemplateCanvas } from "@/components/lesson-plans/TemplateCanvas";
import { defaultTemplate, normalizeTemplate, ALL_FORMATS, templateForPage, writePageBack } from "@/lib/lessonPlanDefaults";
import { exportPagesToPdf } from "@/lib/exportPdf";
import { canOpenGmailCompose } from "@/lib/uaSupport";
import type { LessonPlanTemplate, TemplateFormat } from "@/lib/lessonPlanTypes";
import { formatMMTDate, getMMTDateParts } from "@/lib/mmt";

function wipeCards(cards: any[]) {
  return cards.map(c => ({
    ...c,
    rows: c.rows.map((r: any) => ({
      ...r,
      cells: r.cells.map((cell: any) => (cell.locked ? cell : { ...cell, value: "" })),
    })),
  }));
}

function clearUnlocked(t: LessonPlanTemplate): LessonPlanTemplate {
  return {
    ...t,
    cards: wipeCards(t.cards),
    pages: t.pages?.map(p => ({ ...p, cards: wipeCards(p.cards) })) ?? t.pages,
  };
}

/** Deep clone of the blank first page — used by "New Page". */
function blankPageFrom(t: LessonPlanTemplate) {
  const base = t.pages?.[0] ?? { id: "p0", cards: t.cards, freeElements: t.freeElements };
  const clone = JSON.parse(JSON.stringify(base));
  return {
    ...clone,
    id: `p${Math.random().toString(36).slice(2, 8)}`,
    cards: wipeCards(clone.cards ?? []),
  };
}

const draftKey = (uid: string, cls: string, fmt: string) => `lp-draft:${uid}:${cls}:${fmt}`;

export default function MyTimetablePage() {
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  /** Pristine copies straight from the database (used by Reset). */
  const [baseTemplates, setBaseTemplates] = useState<Partial<Record<TemplateFormat, LessonPlanTemplate>>>({});
  const [templates, setTemplates] = useState<Partial<Record<TemplateFormat, LessonPlanTemplate>>>({});
  const [format, setFormat] = useState<TemplateFormat>("format1");
  const [exporting, setExporting] = useState(false);
  const pageRefs = useRef<Record<number, HTMLDivElement>>({});

  const cls = profile?.class && ["Beginner", "Junior", "Senior"].includes(profile.class) ? profile.class : null;
  const fullTemplate = templates[format] ?? null;
  const pageCount = fullTemplate?.pages?.length ?? 1;
  const pageViews = useMemo(
    () => (fullTemplate ? Array.from({ length: pageCount }, (_, i) => templateForPage(fullTemplate, i)) : []),
    [fullTemplate, pageCount],
  );

  useEffect(() => {
    if (!cls) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("lesson_plan_templates")
        .select("format, template_json")
        .eq("class", cls);
      if (error) {
        toast({ title: "Failed to load template", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const next: Partial<Record<TemplateFormat, LessonPlanTemplate>> = {};
      (data ?? []).forEach((row: any) => {
        const f = row.format as TemplateFormat;
        if (!ALL_FORMATS.includes(f)) return;
        next[f] = normalizeTemplate(row.template_json, cls, f);
      });
      if (!next.format1) next.format1 = defaultTemplate(cls, "format1");
      setBaseTemplates(next);

      // Restore any locally saved draft for this staff member.
      const withDrafts: Partial<Record<TemplateFormat, LessonPlanTemplate>> = { ...next };
      const uid = profile?.id;
      if (uid) {
        (Object.keys(next) as TemplateFormat[]).forEach(f => {
          try {
            const raw = localStorage.getItem(draftKey(uid, cls, f));
            if (raw) withDrafts[f] = JSON.parse(raw) as LessonPlanTemplate;
          } catch { /* ignore corrupted draft */ }
        });
      }
      setTemplates(withDrafts);
      setFormat(ALL_FORMATS.find(f => withDrafts[f]) ?? "format1");
      setLoading(false);
    })();
  }, [cls, profile?.id]);

  useEffect(() => { pageRefs.current = {}; }, [format]);

  const setPage = (idx: number, edited: LessonPlanTemplate) => {
    if (!fullTemplate) return;
    setTemplates(prev => ({ ...prev, [format]: writePageBack(fullTemplate, idx, edited) }));
  };

  const addPage = () => {
    if (!fullTemplate) return;
    const pages = fullTemplate.pages ?? [{ id: "p0", cards: fullTemplate.cards, freeElements: fullTemplate.freeElements }];
    setTemplates(prev => ({ ...prev, [format]: { ...fullTemplate, pages: [...pages, blankPageFrom(fullTemplate)] } }));
  };

  const removePage = (idx: number) => {
    if (!fullTemplate?.pages || fullTemplate.pages.length <= 1) return;
    if (!confirm(`Page ${idx + 1} ကို ဖျက်မှာ သေချာပါသလား?`)) return;
    const pages = fullTemplate.pages.filter((_, i) => i !== idx);
    setTemplates(prev => ({ ...prev, [format]: { ...fullTemplate, pages, cards: pages[0].cards, freeElements: pages[0].freeElements } }));
  };

  const saveDraft = () => {
    if (!fullTemplate || !profile?.id || !cls) return;
    try {
      localStorage.setItem(draftKey(profile.id, cls, format), JSON.stringify(fullTemplate));
      toast({ title: "Saved", description: "ဖြည့်ထားသော အချက်အလက်များကို သိမ်းပြီးပါပြီ။" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? "Storage full", variant: "destructive" });
    }
  };

  const resetDraft = () => {
    if (!fullTemplate || !cls) return;
    if (!confirm("ဖြည့်ထားသော အချက်အလက်များ အားလုံး ပျက်သွားပါမည်။ သေချာပါသလား?")) return;
    const base = baseTemplates[format] ?? fullTemplate;
    setTemplates(prev => ({ ...prev, [format]: clearUnlocked(base) }));
    if (profile?.id) localStorage.removeItem(draftKey(profile.id, cls, format));
    toast({ title: "Reset", description: "ဖြည့်ထားသော စာများကို ဖျက်ပေးပြီးပါပြီ။" });
  };

  const doExport = async (alsoReport: boolean) => {
    if (!fullTemplate) return;
    setExporting(true);
    try {
      const elements: HTMLElement[] = [];
      for (let i = 0; i < pageCount; i++) {
        const el = pageRefs.current[i];
        if (el) elements.push(el);
      }
      const { year, month, day } = getMMTDateParts(new Date());
      const filename = `LessonPlan_${cls}_${format}_${year}-${month}-${day}.pdf`;
      await exportPagesToPdf(elements, fullTemplate.page.size, fullTemplate.page.orientation, filename);

      if (alsoReport) {
        const subject = encodeURIComponent(`Lesson Plan – ${profile?.full_name ?? "Staff"} – ${formatMMTDate(new Date())}`);
        const body = encodeURIComponent(`Dear Admin,\n\nPlease find my lesson plan attached (file: ${filename}).\n\nBest regards,\n${profile?.full_name ?? ""}`);
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, "_blank");
      }
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!cls) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" /> My Timetable & Lesson Plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              သင်၏ Class သတ်မှတ်ထားခြင်း မရှိသေးပါ။ Admin / IT Manager ထံ ဆက်သွယ်ပါ။
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const availableFormats = ALL_FORMATS.filter(f => templates[f]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> My Timetable & Lesson Plans — {cls}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={saveDraft}>
              <Save className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button variant="outline" onClick={resetDraft}>
              <RotateCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
            <Button onClick={() => doExport(false)} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Export & Download
            </Button>
            {canOpenGmailCompose() && (
              <Button variant="secondary" onClick={() => doExport(true)} disabled={exporting}>
                <Mail className="h-4 w-4 mr-1" />
                Export, Download & Report to Admin
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={format} onValueChange={(v) => setFormat(v as TemplateFormat)}>
            <TabsList className="flex-wrap h-auto">
              {availableFormats.map(f => (
                <TabsTrigger key={f} value={f}>{templates[f]?.displayName ?? f}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            IT Manager သတ်မှတ်ထားသော အကွက်များတွင် စာရိုက်ထည့်ပါ။ စာမျက်နှာ ပြည့်သွားပါက အောက်ဆုံးရှိ <strong>+ New Page</strong> ကို နှိပ်၍ ပုံစံတူ စာမျက်နှာ ထပ်ထည့်နိုင်ပါသည်။ <strong>Save</strong> နှိပ်ထားပါက ဖြည့်ထားသည်များ ဆက်လက် တည်ရှိပြီး <strong>Reset</strong> နှိပ်မှသာ ပျက်သွားပါမည်။
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {pageViews.map((view, idx) => (
          <div key={idx} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Page {idx + 1} / {pageCount}</span>
              {pageCount > 1 && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removePage(idx)}>
                  Delete Page {idx + 1}
                </Button>
              )}
            </div>
            <div className="overflow-auto bg-muted/30 rounded-lg p-4">
              <TemplateCanvas
                ref={(el) => { if (el) pageRefs.current[idx] = el; }}
                template={view}
                editable
                onCellChange={(cardId, rowId, cellId, value) => {
                  setPage(idx, {
                    ...view,
                    cards: view.cards.map(c => c.id !== cardId ? c : {
                      ...c,
                      rows: c.rows.map(r => r.id !== rowId ? r : {
                        ...r,
                        cells: r.cells.map(cell => cell.id !== cellId ? cell : { ...cell, value }),
                      }),
                    }),
                  });
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center pb-8">
        <Button variant="outline" onClick={addPage}>
          <Plus className="h-4 w-4 mr-1" /> New Page
        </Button>
      </div>
    </div>
  );
}
