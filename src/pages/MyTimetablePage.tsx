import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CalendarDays, Download, Mail, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/components/ui/use-toast";
import { TemplateCanvas } from "@/components/lesson-plans/TemplateCanvas";
import { SatisfactionModal } from "@/components/lesson-plans/SatisfactionModal";
import { defaultTemplate, normalizeTemplate, ALL_FORMATS, templateForPage, writePageBack } from "@/lib/lessonPlanDefaults";
import { exportPagesToPdf } from "@/lib/exportPdf";
import { canOpenGmailCompose } from "@/lib/uaSupport";
import type { LessonPlanTemplate, TemplateFormat } from "@/lib/lessonPlanTypes";
import { formatMMTDate, getMMTDateParts } from "@/lib/mmt";

function clearUnlocked(t: LessonPlanTemplate): LessonPlanTemplate {
  const wipeCards = (cards: any[]) => cards.map(c => ({
    ...c,
    rows: c.rows.map((r: any) => ({
      ...r,
      cells: r.cells.map((cell: any) => cell.locked ? cell : { ...cell, value: "" }),
    })),
  }));
  return {
    ...t,
    cards: wipeCards(t.cards),
    pages: t.pages?.map(p => ({ ...p, cards: wipeCards(p.cards) })) ?? t.pages,
  };
}

export default function MyTimetablePage() {
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Partial<Record<TemplateFormat, LessonPlanTemplate>>>({});
  const [format, setFormat] = useState<TemplateFormat>("format1");
  const [pageIdx, setPageIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [askSatisfaction, setAskSatisfaction] = useState(false);
  const pageRefs = useRef<HTMLDivElement[]>([]);

  const cls = profile?.class && ["Beginner", "Junior", "Senior"].includes(profile.class) ? profile.class : null;
  const fullTemplate = templates[format] ?? null;
  const pageCount = fullTemplate?.pages?.length ?? 1;
  const viewTemplate = fullTemplate ? templateForPage(fullTemplate, pageIdx) : null;

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
      // Always provide format1 default if nothing exists yet.
      if (!next.format1) next.format1 = defaultTemplate(cls, "format1");
      setTemplates(next);
      const firstAvailable = ALL_FORMATS.find(f => next[f]) ?? "format1";
      setFormat(firstAvailable);
      setPageIdx(0);
      setLoading(false);
    })();
  }, [cls]);

  useEffect(() => { setPageIdx(0); pageRefs.current = []; }, [format]);

  const setView = (edited: LessonPlanTemplate) => {
    if (!fullTemplate) return;
    setTemplates(prev => ({ ...prev, [format]: writePageBack(fullTemplate, pageIdx, edited) }));
  };

  const doExport = async (alsoReport: boolean) => {
    if (!fullTemplate) return;
    setExporting(true);
    try {
      // Render every page (current page in the DOM; others rendered via temporary nodes).
      // Simpler: page through state and capture each canvas. We rely on the live pageRefs by switching pages.
      const elements: HTMLElement[] = [];
      for (let i = 0; i < pageCount; i++) {
        if (i !== pageIdx) setPageIdx(i);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const el = pageRefs.current[0];
        if (el) elements.push(el);
      }
      // restore visible page
      setPageIdx(0);

      const { year, month, day } = getMMTDateParts(new Date());
      const filename = `LessonPlan_${cls}_${format}_${year}-${month}-${day}.pdf`;
      await exportPagesToPdf(elements, fullTemplate.page.size, fullTemplate.page.orientation, filename);

      if (alsoReport) {
        const subject = encodeURIComponent(`Lesson Plan – ${profile?.full_name ?? "Staff"} – ${formatMMTDate(new Date())}`);
        const body = encodeURIComponent(`Dear Admin,\n\nPlease find my lesson plan attached (file: ${filename}).\n\nBest regards,\n${profile?.full_name ?? ""}`);
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, "_blank");
      }
      setAskSatisfaction(true);
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const onSatisfied = () => {
    if (fullTemplate) setTemplates(prev => ({ ...prev, [format]: clearUnlocked(fullTemplate) }));
    setAskSatisfaction(false);
    toast({ title: "ပြီးပါပြီ", description: "ဖြည့်ထားသော စာများကို ဖျက်ပေးပြီးပါပြီ။" });
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
          {pageCount > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {Array.from({ length: pageCount }, (_, i) => (
                <Button key={i} size="sm" variant={i === pageIdx ? "default" : "outline"} onClick={() => setPageIdx(i)}>
                  Page {i + 1}
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            IT Manager သတ်မှတ်ထားသော အကွက်များတွင် စာရိုက်ထည့်ပါ။ Page များ ရှိပါက အပေါ်က Page tab လေးတွေ ဖြင့် ပြောင်းကြည့်နိုင်ပါသည်။
          </p>
        </CardContent>
      </Card>

      {viewTemplate && (
        <div className="overflow-auto bg-muted/30 rounded-lg p-4">
          <TemplateCanvas
            ref={(el) => { if (el) pageRefs.current[0] = el; }}
            template={viewTemplate}
            editable
            onCellChange={(cardId, rowId, cellId, value) => {
              setView({
                ...viewTemplate,
                cards: viewTemplate.cards.map(c => c.id !== cardId ? c : {
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
      )}

      <SatisfactionModal
        open={askSatisfaction}
        onOk={onSatisfied}
        onRetry={() => setAskSatisfaction(false)}
      />
    </div>
  );
}
