import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import { TemplateEditor } from "@/components/lesson-plans/TemplateEditor";
import { defaultTemplate, normalizeTemplate, templateForPage, writePageBack, ALL_FORMATS, MAX_FORMATS, newEmptyPage } from "@/lib/lessonPlanDefaults";
import type { LessonPlanTemplate, ClassName, TemplateFormat } from "@/lib/lessonPlanTypes";

const CLASSES: ClassName[] = ["Beginner", "Junior", "Senior"];

type Key = `${ClassName}__${TemplateFormat}`;
const k = (c: ClassName, f: TemplateFormat): Key => `${c}__${f}` as Key;

export default function LessonPlansEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Key | null>(null);
  const [templates, setTemplates] = useState<Partial<Record<Key, LessonPlanTemplate>>>({});
  /** Which formats exist per class (in display order). */
  const [formatsByClass, setFormatsByClass] = useState<Record<ClassName, TemplateFormat[]>>({
    Beginner: ["format1", "format2"],
    Junior: ["format1", "format2"],
    Senior: ["format1", "format2"],
  });
  const [active, setActive] = useState<ClassName>("Beginner");
  const [activeFormat, setActiveFormat] = useState<Record<ClassName, TemplateFormat>>({ Beginner: "format1", Junior: "format1", Senior: "format1" });
  const [pageIdxByKey, setPageIdxByKey] = useState<Partial<Record<Key, number>>>({});
  const [renamingKey, setRenamingKey] = useState<Key | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

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
      const next: Partial<Record<Key, LessonPlanTemplate>> = {};
      const presence: Record<ClassName, Set<TemplateFormat>> = { Beginner: new Set(), Junior: new Set(), Senior: new Set() };
      (data ?? []).forEach((row: any) => {
        const cls = row.class as ClassName;
        const fmt = (row.format as TemplateFormat) ?? "format1";
        if (!CLASSES.includes(cls) || !ALL_FORMATS.includes(fmt)) return;
        next[k(cls, fmt)] = normalizeTemplate(row.template_json, cls, fmt);
        presence[cls].add(fmt);
      });
      // Ensure format1 + format2 default templates exist locally for every class.
      CLASSES.forEach(c => {
        if (!presence[c].has("format1")) { next[k(c, "format1")] = defaultTemplate(c, "format1"); presence[c].add("format1"); }
        if (!presence[c].has("format2")) { next[k(c, "format2")] = defaultTemplate(c, "format2"); presence[c].add("format2"); }
      });
      setTemplates(next);
      setFormatsByClass({
        Beginner: ALL_FORMATS.filter(f => presence.Beginner.has(f)),
        Junior: ALL_FORMATS.filter(f => presence.Junior.has(f)),
        Senior: ALL_FORMATS.filter(f => presence.Senior.has(f)),
      });
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (renamingKey) renameInputRef.current?.focus();
  }, [renamingKey]);

  const save = async (cls: ClassName, fmt: TemplateFormat) => {
    const key = k(cls, fmt);
    const t = templates[key];
    if (!t) return;
    setSaving(key);
    const { error } = await supabase
      .from("lesson_plan_templates")
      .upsert({ class: cls, format: fmt, template_json: t as any, updated_at: new Date().toISOString() }, { onConflict: "class,format" });
    setSaving(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template saved", description: `${cls} — ${t.displayName ?? fmt} updated.` });
    }
  };

  const reset = (cls: ClassName, fmt: TemplateFormat) => {
    setTemplates(prev => ({ ...prev, [k(cls, fmt)]: defaultTemplate(cls, fmt) }));
  };

  const addFormat = (cls: ClassName) => {
    const existing = formatsByClass[cls];
    if (existing.length >= MAX_FORMATS) {
      toast({ title: `Limit ${MAX_FORMATS} formats per class`, variant: "destructive" });
      return;
    }
    const nextFmt = ALL_FORMATS.find(f => !existing.includes(f));
    if (!nextFmt) return;
    const t = defaultTemplate(cls, nextFmt);
    setTemplates(prev => ({ ...prev, [k(cls, nextFmt)]: t }));
    setFormatsByClass(prev => ({ ...prev, [cls]: [...prev[cls], nextFmt] }));
    setActiveFormat(prev => ({ ...prev, [cls]: nextFmt }));
  };

  const removeFormat = async (cls: ClassName, fmt: TemplateFormat) => {
    if (formatsByClass[cls].length <= 1) {
      toast({ title: "At least one format required", variant: "destructive" });
      return;
    }
    if (!confirm(`Delete ${templates[k(cls, fmt)]?.displayName ?? fmt}?`)) return;
    const { error } = await supabase.from("lesson_plan_templates").delete().eq("class", cls).eq("format", fmt);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setTemplates(prev => { const n = { ...prev }; delete n[k(cls, fmt)]; return n; });
    setFormatsByClass(prev => ({ ...prev, [cls]: prev[cls].filter(f => f !== fmt) }));
    setActiveFormat(prev => prev[cls] === fmt ? { ...prev, [cls]: formatsByClass[cls].filter(f => f !== fmt)[0] } : prev);
    toast({ title: "Format deleted" });
  };

  const startRename = (cls: ClassName, fmt: TemplateFormat) => {
    const key = k(cls, fmt);
    setRenamingKey(key);
    setRenameDraft(templates[key]?.displayName ?? fmt);
  };

  const commitRename = (cls: ClassName, fmt: TemplateFormat) => {
    const key = k(cls, fmt);
    const name = renameDraft.trim();
    if (!name) { setRenamingKey(null); return; }
    const t = templates[key];
    if (t) setTemplates(prev => ({ ...prev, [key]: { ...t, displayName: name } }));
    setRenamingKey(null);
  };

  const addPage = (cls: ClassName, fmt: TemplateFormat) => {
    const key = k(cls, fmt);
    const t = templates[key];
    if (!t) return;
    const newPages = [...(t.pages ?? [{ id: "p0", cards: t.cards, freeElements: t.freeElements }]), newEmptyPage()];
    setTemplates(prev => ({ ...prev, [key]: { ...t, pages: newPages } }));
    setPageIdxByKey(prev => ({ ...prev, [key]: newPages.length - 1 }));
  };

  const removePage = (cls: ClassName, fmt: TemplateFormat, idx: number) => {
    const key = k(cls, fmt);
    const t = templates[key];
    if (!t?.pages || t.pages.length <= 1) { toast({ title: "At least one page required", variant: "destructive" }); return; }
    if (!confirm(`Delete Page ${idx + 1}?`)) return;
    const newPages = t.pages.filter((_, i) => i !== idx);
    setTemplates(prev => ({ ...prev, [key]: { ...t, pages: newPages, cards: newPages[0].cards, freeElements: newPages[0].freeElements } }));
    setPageIdxByKey(prev => ({ ...prev, [key]: Math.max(0, Math.min(idx, newPages.length - 1)) }));
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
            Class တစ်ခုစီအတွက် Format အများဆုံး {MAX_FORMATS} မျိုး ဖန်တီးနိုင်ပါသည် (Format tab ကို double-click လုပ်၍ rename လုပ်နိုင်ပါသည်)။ Format တိုင်းတွင် Page များ ထပ်ထည့်နိုင်ပါသည်။ Staff များသည် မိမိ Class ၏ Format အားလုံးကို My Timetable & Lesson Plans တွင် ရွေးချယ်အသုံးပြုနိုင်ပါသည်။
          </p>
        </CardContent>
      </Card>

      <Tabs value={active} onValueChange={(v) => setActive(v as ClassName)}>
        <TabsList>
          {CLASSES.map(c => (
            <TabsTrigger key={c} value={c}>{c} Lesson Plans Template Editor</TabsTrigger>
          ))}
        </TabsList>

        {CLASSES.map(c => {
          const formats = formatsByClass[c];
          const fmt = formats.includes(activeFormat[c]) ? activeFormat[c] : formats[0];
          const key = k(c, fmt);
          const t = templates[key];
          const pageIdx = pageIdxByKey[key] ?? 0;
          const pageCount = t?.pages?.length ?? 1;
          return (
            <TabsContent key={c} value={c} className="space-y-3">
              <div className="flex items-center gap-1 flex-wrap border-b">
                {formats.map(f => {
                  const fKey = k(c, f);
                  const isActive = f === fmt;
                  const displayName = templates[fKey]?.displayName ?? f;
                  const isRenaming = renamingKey === fKey;
                  return (
                    <div
                      key={f}
                      className={`group flex items-center gap-1 px-3 py-2 border-t border-l border-r rounded-t-md cursor-pointer ${isActive ? "bg-background border-border" : "bg-muted/40 border-transparent hover:bg-muted"}`}
                      onClick={() => !isRenaming && setActiveFormat(prev => ({ ...prev, [c]: f }))}
                      onDoubleClick={(e) => { e.stopPropagation(); startRename(c, f); }}
                      title="Double-click to rename"
                    >
                      {isRenaming ? (
                        <Input
                          ref={renameInputRef}
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => commitRename(c, f)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(c, f);
                            if (e.key === "Escape") setRenamingKey(null);
                          }}
                          className="h-7 text-sm w-32"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <span className="text-sm font-medium">{displayName}</span>
                          {isActive && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); startRename(c, f); }}
                                className="opacity-60 hover:opacity-100"
                                title="Rename"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              {formats.length > 1 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeFormat(c, f); }}
                                  className="opacity-60 hover:opacity-100 text-destructive"
                                  title="Delete format"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {formats.length < MAX_FORMATS && (
                  <Button size="sm" variant="ghost" onClick={() => addFormat(c)} className="ml-1 h-8">
                    <Plus className="h-3 w-3 mr-1" /> Add Format
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {Array.from({ length: pageCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-0.5">
                      <Button
                        size="sm"
                        variant={i === pageIdx ? "default" : "outline"}
                        onClick={() => setPageIdxByKey(prev => ({ ...prev, [key]: i }))}
                      >
                        Page {i + 1}
                      </Button>
                      {pageCount > 1 && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removePage(c, fmt, i)} title="Delete page">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => addPage(c, fmt)}>
                    <Plus className="h-3 w-3 mr-1" /> Add Page
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => reset(c, fmt)}>
                    <RotateCcw className="h-4 w-4 mr-1" /> Reset to default
                  </Button>
                  <Button size="sm" onClick={() => save(c, fmt)} disabled={saving === key}>
                    {saving === key ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save {c} — {templates[key]?.displayName ?? fmt}
                  </Button>
                </div>
              </div>

              {t && (
                <TemplateEditor
                  value={templateForPage(t, pageIdx)}
                  onChange={(edited) => setTemplates(prev => ({ ...prev, [key]: writePageBack(t, pageIdx, edited) }))}
                />
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
