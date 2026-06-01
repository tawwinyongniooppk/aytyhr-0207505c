import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Save, RotateCcw, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { TemplateEditor } from "@/components/lesson-plans/TemplateEditor";
import { defaultTemplate, normalizeTemplate } from "@/lib/lessonPlanDefaults";
import type { LessonPlanTemplate, ClassName, TemplateFormat } from "@/lib/lessonPlanTypes";

const CLASSES: ClassName[] = ["Beginner", "Junior", "Senior"];
const FORMATS: TemplateFormat[] = ["format1", "format2"];

type Key = `${ClassName}__${TemplateFormat}`;
const k = (c: ClassName, f: TemplateFormat): Key => `${c}__${f}` as Key;

export default function LessonPlansEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Key | null>(null);
  const [templates, setTemplates] = useState<Record<Key, LessonPlanTemplate>>(() => {
    const init = {} as Record<Key, LessonPlanTemplate>;
    CLASSES.forEach(c => FORMATS.forEach(f => { init[k(c, f)] = defaultTemplate(c, f); }));
    return init;
  });
  const [active, setActive] = useState<ClassName>("Beginner");
  const [activeFormat, setActiveFormat] = useState<Record<ClassName, TemplateFormat>>({ Beginner: "format1", Junior: "format1", Senior: "format1" });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("lesson_plan_templates")
        .select("class, format, template_json");
      if (error) {
        toast({ title: "Failed to load templates", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const next = { ...templates };
      (data ?? []).forEach((row: any) => {
        const cls = row.class as ClassName;
        const fmt = (row.format as TemplateFormat) ?? "format1";
        if (!CLASSES.includes(cls) || !FORMATS.includes(fmt)) return;
        next[k(cls, fmt)] = normalizeTemplate(row.template_json, cls, fmt);
      });
      setTemplates(next);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (cls: ClassName, fmt: TemplateFormat) => {
    const key = k(cls, fmt);
    setSaving(key);
    const { error } = await supabase
      .from("lesson_plan_templates")
      .upsert({ class: cls, format: fmt, template_json: templates[key] as any, updated_at: new Date().toISOString() }, { onConflict: "class,format" });
    setSaving(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template saved", description: `${cls} — ${fmt === "format1" ? "Format 1" : "Format 2"} updated.` });
    }
  };

  const reset = (cls: ClassName, fmt: TemplateFormat) => {
    setTemplates(prev => ({ ...prev, [k(cls, fmt)]: defaultTemplate(cls, fmt) }));
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Lesson Plans Template Editor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Class တစ်ခုစီအတွက် Format 1 / Format 2 ပုံစံ နှစ်မျိုးကို ကြိုပြင်ထားနိုင်ပါသည်။ Staff များသည် မိမိ Class ၏ နှစ်ပုံစံစလုံးကို My Timetable & Lesson Plans တွင် ရွေးချယ်အသုံးပြုနိုင်ပါသည်။
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
            <Tabs value={activeFormat[c]} onValueChange={(v) => setActiveFormat(prev => ({ ...prev, [c]: v as TemplateFormat }))}>
              <TabsList>
                <TabsTrigger value="format1">Format 1</TabsTrigger>
                <TabsTrigger value="format2">Format 2</TabsTrigger>
              </TabsList>
              {FORMATS.map(f => (
                <TabsContent key={f} value={f} className="space-y-3">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => reset(c, f)}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Reset to default
                    </Button>
                    <Button size="sm" onClick={() => save(c, f)} disabled={saving === k(c, f)}>
                      {saving === k(c, f) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      Save {c} — {f === "format1" ? "Format 1" : "Format 2"}
                    </Button>
                  </div>
                  <TemplateEditor
                    value={templates[k(c, f)]}
                    onChange={v => setTemplates(prev => ({ ...prev, [k(c, f)]: v }))}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
