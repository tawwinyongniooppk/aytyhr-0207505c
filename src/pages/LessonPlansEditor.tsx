import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Save, RotateCcw, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { TemplateEditor } from "@/components/lesson-plans/TemplateEditor";
import { defaultTemplate } from "@/lib/lessonPlanDefaults";
import type { LessonPlanTemplate, ClassName } from "@/lib/lessonPlanTypes";

const CLASSES: ClassName[] = ["Beginner", "Junior", "Senior"];

export default function LessonPlansEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ClassName | null>(null);
  const [templates, setTemplates] = useState<Record<ClassName, LessonPlanTemplate>>({
    Beginner: defaultTemplate("Beginner"),
    Junior: defaultTemplate("Junior"),
    Senior: defaultTemplate("Senior"),
  });
  const [active, setActive] = useState<ClassName>("Beginner");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("lesson_plan_templates")
        .select("class, template_json");
      if (error) {
        toast({ title: "Failed to load templates", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const next = { ...templates };
      (data ?? []).forEach((row: any) => {
        const cls = row.class as ClassName;
        const j = row.template_json;
        if (j && typeof j === "object" && j.cards) {
          next[cls] = j as LessonPlanTemplate;
        }
      });
      setTemplates(next);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (cls: ClassName) => {
    setSaving(cls);
    const { error } = await supabase
      .from("lesson_plan_templates")
      .upsert({ class: cls, template_json: templates[cls] as any, updated_at: new Date().toISOString() }, { onConflict: "class" });
    setSaving(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template saved", description: `${cls} lesson plan template updated.` });
    }
  };

  const reset = (cls: ClassName) => {
    setTemplates(prev => ({ ...prev, [cls]: defaultTemplate(cls) }));
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Lesson Plans Template Editor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Class တစ်ခုစီအတွက် Lesson Plan ပုံစံကို ကြိုတင်ပြင်ထားပါ။ Staff များသည် မိမိ Class ၏ Template ကိုသာ My Timetable & Lesson Plans တွင် မြင်ပြီး Lock မထားသော Cell များတွင် စာရိုက်ထည့်နိုင်ပါသည်။
          </p>
        </CardContent>
      </Card>

      <Tabs value={active} onValueChange={(v) => setActive(v as ClassName)}>
        <TabsList>
          {CLASSES.map(c => (
            <TabsTrigger key={c} value={c}>{c} Lesson Plans Template Editor</TabsTrigger>
          ))}
        </TabsList>

        {CLASSES.map(c => (
          <TabsContent key={c} value={c} className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => reset(c)}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reset to default
              </Button>
              <Button size="sm" onClick={() => save(c)} disabled={saving === c}>
                {saving === c ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save {c}
              </Button>
            </div>
            <TemplateEditor value={templates[c]} onChange={v => setTemplates(prev => ({ ...prev, [c]: v }))} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
