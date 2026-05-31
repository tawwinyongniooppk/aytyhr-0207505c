import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarDays, Download, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/components/ui/use-toast";
import { TemplateCanvas } from "@/components/lesson-plans/TemplateCanvas";
import { SatisfactionModal } from "@/components/lesson-plans/SatisfactionModal";
import { defaultTemplate } from "@/lib/lessonPlanDefaults";
import { exportPagesToPdf } from "@/lib/exportPdf";
import { canOpenGmailCompose } from "@/lib/uaSupport";
import type { LessonPlanTemplate } from "@/lib/lessonPlanTypes";
import { formatMMTDate, getMMTDateParts } from "@/lib/mmt";

function clearUnlockedValues(t: LessonPlanTemplate): LessonPlanTemplate {
  return {
    ...t,
    cards: t.cards.map(c => ({
      ...c,
      rows: c.rows.map(r => ({
        ...r,
        cells: r.cells.map(cell => cell.locked ? cell : { ...cell, value: "" }),
      })),
    })),
  };
}

export default function MyTimetablePage() {
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<LessonPlanTemplate | null>(null);
  const [exporting, setExporting] = useState(false);
  const [askSatisfaction, setAskSatisfaction] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const cls = profile?.class && ["Beginner","Junior","Senior"].includes(profile.class) ? profile.class : null;

  useEffect(() => {
    if (!cls) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("lesson_plan_templates")
        .select("template_json")
        .eq("class", cls)
        .maybeSingle();
      if (error) {
        toast({ title: "Failed to load template", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const j = data?.template_json as any;
      setTemplate(j && j.cards ? j as LessonPlanTemplate : defaultTemplate(cls));
      setLoading(false);
    })();
  }, [cls]);

  const onChange = (t: LessonPlanTemplate) => setTemplate(t);

  const doExport = async (alsoReport: boolean) => {
    if (!canvasRef.current || !template) return;
    setExporting(true);
    try {
      const { year, month, day } = getMMTDateParts(new Date());
      const filename = `LessonPlan_${cls}_${year}-${month}-${day}.pdf`;
      await exportPagesToPdf([canvasRef.current], template.page.size, template.page.orientation, filename);
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
    if (template) setTemplate(clearUnlockedValues(template));
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
        <CardContent>
          <p className="text-xs text-muted-foreground">
            IT Manager သတ်မှတ်ထားသော အကွက်များတွင် စာရိုက်ထည့်ပါ။ Enter နှိပ်ပါက Cell ထဲ စာကြောင်းအသစ်တိုးပေးပါသည်။ စာရိုက်ပြီး Download ဆွဲပြီးပါက "အဆင်ပြေတယ်" / "အဆင်မပြေဘူး" ပေါ်လာပါမည်။
          </p>
        </CardContent>
      </Card>

      {template && (
        <div className="overflow-auto bg-muted/30 rounded-lg p-4">
          <TemplateCanvas
            ref={canvasRef}
            template={template}
            editable
            onCellChange={(cardId, rowId, cellId, value) => {
              setTemplate({
                ...template,
                cards: template.cards.map(c => c.id !== cardId ? c : {
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
