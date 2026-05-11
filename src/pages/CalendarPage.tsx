import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";

interface CalEvent {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  event_type: string;
  visibility: string;
  created_by: string;
}

interface StaffProfile {
  id: string;
  full_name: string;
  work_schedule?: any;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const EVENT_COLORS: Record<string, string> = {
  holiday: "bg-destructive text-destructive-foreground",
  meeting: "bg-blue-500 text-white",
  event: "bg-green-500 text-white",
  task: "bg-orange-500 text-white",
};

const EVENT_DOT_COLORS: Record<string, string> = {
  holiday: "bg-destructive",
  meeting: "bg-blue-500",
  event: "bg-green-500",
  task: "bg-orange-500",
};

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { user } = useAuth();
  const { isAdmin, isAssistant, isStaff } = useProfile();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [mySchedule, setMySchedule] = useState<Record<string, { active: boolean }> | null>(null);
  const [offStaffByWeekday, setOffStaffByWeekday] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [assignmentLoad, setAssignmentLoad] = useState<Record<string, { weekly: number; biweekly: number; weighted: number }>>({});

  const [form, setForm] = useState({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    event_type: "event",
    visibility: "public",
    allStaff: true,
    assignedIds: [] as string[],
    frequency: "weekly" as "weekly" | "biweekly",
  });

  function addDaysISO(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }

  function computeDeadline(startDate: string, frequency: "weekly" | "biweekly") {
    if (!startDate) return "";
    return addDaysISO(startDate, frequency === "weekly" ? 6 : 13);
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  useEffect(() => {
    loadEvents();
    loadMySchedule();
    if (!isStaff) loadStaff();
  }, [user, isStaff, isAssistant]);

  // Realtime: refresh schedule when any relevant profile work_schedule changes
  useEffect(() => {
    if (!user) return;
    const filter = isStaff ? `id=eq.${user.id}` : undefined;
    const channel = supabase
      .channel("profile-schedule-sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", ...(filter ? { filter } : {}) },
        () => { loadMySchedule(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isStaff]);

  async function loadMySchedule() {
    if (!user) return;
    try {
      // Admin/Assistant: collect per-weekday off staff names. Any staff marked off => weekday is a holiday for them.
      // Staff: use own schedule.
      if (!isStaff) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, work_schedule, role")
          .eq("role", "staff");
        const rows = (data || []) as Array<{ full_name: string; work_schedule: any }>;
        const byDay: Record<string, string[]> = {};
        const merged: Record<string, { active: boolean }> = {};
        for (const day of WEEKDAY_NAMES) {
          const offNames = rows
            .filter((r) => r.work_schedule && r.work_schedule[day] && r.work_schedule[day].active === false)
            .map((r) => r.full_name || "Unnamed");
          byDay[day] = offNames;
          // Treat the day as a Holiday if ANY staff is off that day
          merged[day] = { active: offNames.length === 0 };
        }
        setOffStaffByWeekday(byDay);
        setMySchedule(merged);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("work_schedule")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.work_schedule) setMySchedule(data.work_schedule as any);
      setOffStaffByWeekday({});
    } catch { /* ignore */ }
  }

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .order("start_date", { ascending: true });
      if (error) throw error;
      setEvents((data as CalEvent[]) || []);
    } catch {
      toast({ title: "Error", description: "Failed to load events", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function loadStaff() {
    try {
      // Admin can assign tasks to Staff and Assistant Admin.
      // Assistant Admin can assign only to Staff.
      const roles = isAssistant ? ["staff"] : ["staff", "assistant"];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", roles);
      setStaffList(data || []);
    } catch { /* ignore */ }
  }

  // Per-assignee monthly load: weekly=1 weighted unit, biweekly=2; cap = 4 weighted units / month / person.
  const MONTHLY_WEIGHT_CAP = 4;
  function monthBoundsFor(dateStr: string) {
    const monthStart = (dateStr || new Date().toISOString().split("T")[0]).slice(0, 7) + "-01";
    const d = new Date(monthStart + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    return { monthStart, nextMonthStart: d.toISOString().split("T")[0] };
  }

  async function loadAssignmentLoad(dateStr: string) {
    try {
      const { monthStart, nextMonthStart } = monthBoundsFor(dateStr);
      const { data: taskEvents } = await supabase
        .from("calendar_events")
        .select("id, start_date, end_date")
        .eq("event_type", "task")
        .gte("start_date", monthStart)
        .lt("start_date", nextMonthStart);
      const evList = (taskEvents as { id: string; start_date: string; end_date: string }[]) || [];
      if (evList.length === 0) { setAssignmentLoad({}); return; }
      const evMap = new Map(evList.map((e) => [e.id, e]));
      const { data: ass } = await supabase
        .from("calendar_event_assignments")
        .select("user_id, event_id")
        .in("event_id", evList.map((e) => e.id));
      const load: Record<string, { weekly: number; biweekly: number; weighted: number }> = {};
      for (const a of (ass as { user_id: string; event_id: string }[]) || []) {
        const ev = evMap.get(a.event_id);
        if (!ev) continue;
        const days = Math.round(
          (new Date(ev.end_date + "T00:00:00").getTime() - new Date(ev.start_date + "T00:00:00").getTime()) / 86400000
        );
        const isBiweekly = days >= 13;
        const entry = load[a.user_id] || { weekly: 0, biweekly: 0, weighted: 0 };
        if (isBiweekly) { entry.biweekly += 1; entry.weighted += 2; }
        else { entry.weekly += 1; entry.weighted += 1; }
        load[a.user_id] = entry;
      }
      setAssignmentLoad(load);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (isStaff) return;
    if (!open) return;
    loadAssignmentLoad(form.start_date || new Date().toISOString().split("T")[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.start_date, isStaff]);


  function isHolidayDate(dateStr: string) {
    if (!dateStr) return false;
    return events.some(
      (e) => e.event_type === "holiday" && e.start_date <= dateStr && e.end_date >= dateStr
    );
  }

  async function handleCreate() {
    if (!form.title || !form.start_date || !user) return;
    if (isHolidayDate(form.start_date)) {
      toast({ title: "ပိတ်ရက်မှာ New Task လုပ်ခွင့် မပြုပါ", variant: "destructive" });
      return;
    }

    const deadline = computeDeadline(form.start_date, form.frequency);
    const monthlyCap = form.frequency === "weekly" ? 4 : 2;

    // Quota: count tasks created by this user whose start_date falls in the same month.
    const monthStart = form.start_date.slice(0, 7) + "-01";
    const nextMonthStart = (() => {
      const d = new Date(monthStart + "T00:00:00");
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().split("T")[0];
    })();
    const existingThisMonth = events.filter(
      (e) =>
        e.event_type === "task" &&
        e.created_by === user.id &&
        e.start_date >= monthStart &&
        e.start_date < nextMonthStart
    ).length;
    if (existingThisMonth >= monthlyCap) {
      toast({
        title: "Monthly task limit reached",
        description: `You can assign at most ${monthlyCap} ${form.frequency === "weekly" ? "weekly" : "bi-weekly"} tasks per month.`,
        variant: "destructive",
      });
      return;
    }

    // Per-assignee monthly cap (weekly=1 weighted unit, biweekly=2; cap 4/month).
    const newWeight = form.frequency === "weekly" ? 1 : 2;
    const candidateIds = form.allStaff ? staffList.map((s) => s.id) : form.assignedIds;
    if (candidateIds.length === 0) {
      toast({ title: "Select at least one assignee", variant: "destructive" });
      return;
    }
    // Refresh load for the target month before validating.
    await loadAssignmentLoad(form.start_date);
    const { monthStart: ms, nextMonthStart: nms } = monthBoundsFor(form.start_date);
    const { data: freshEvents } = await supabase
      .from("calendar_events")
      .select("id, start_date, end_date")
      .eq("event_type", "task")
      .gte("start_date", ms)
      .lt("start_date", nms);
    const freshList = (freshEvents as { id: string; start_date: string; end_date: string }[]) || [];
    const freshMap = new Map(freshList.map((e) => [e.id, e]));
    const freshLoad: Record<string, number> = {};
    if (freshList.length) {
      const { data: ass } = await supabase
        .from("calendar_event_assignments")
        .select("user_id, event_id")
        .in("event_id", freshList.map((e) => e.id));
      for (const a of (ass as { user_id: string; event_id: string }[]) || []) {
        const ev = freshMap.get(a.event_id);
        if (!ev) continue;
        const days = Math.round(
          (new Date(ev.end_date + "T00:00:00").getTime() - new Date(ev.start_date + "T00:00:00").getTime()) / 86400000
        );
        freshLoad[a.user_id] = (freshLoad[a.user_id] || 0) + (days >= 13 ? 2 : 1);
      }
    }
    const nameById: Record<string, string> = Object.fromEntries(staffList.map((s) => [s.id, s.full_name || "Unnamed"]));
    const blocked = candidateIds.filter((id) => (freshLoad[id] || 0) + newWeight > MONTHLY_WEIGHT_CAP);
    if (blocked.length > 0) {
      toast({
        title: "Monthly assignment limit reached",
        description: `Cannot assign — over the 4-units/month cap for: ${blocked.map((id) => nameById[id] || "user").join(", ")}.`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const isAllStaff = form.allStaff;

      const { data: ev, error } = await supabase
        .from("calendar_events")
        .insert({
          title: form.title,
          description: form.description,
          start_date: form.start_date,
          end_date: deadline,
          event_type: "task",
          visibility: "private",
          created_by: user.id,
          assigned_to_all: isAllStaff,
        } as any)
        .select()
        .single();
      if (error) throw error;

      if (ev) {
        const ids = form.allStaff ? staffList.map((s) => s.id) : form.assignedIds;
        if (ids.length > 0) {
          const { error: assignErr } = await supabase.from("calendar_event_assignments").insert(
            ids.map((uid) => ({ event_id: ev.id, user_id: uid, submission_status: "not_started" }))
          );
          if (assignErr) throw assignErr;
        }
      }

      toast({ title: "Task created successfully" });
      setForm({ title: "", description: "", start_date: "", end_date: "", event_type: "task", visibility: "private", allStaff: true, assignedIds: [], frequency: "weekly" });
      setOpen(false);
      loadEvents();
    } catch {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.start_date <= dateStr && e.end_date >= dateStr);
  };

  const filteredEvents = useMemo(() => {
    let list = events;
    if (filterType !== "all") list = list.filter((e) => e.event_type === filterType);
    return list;
  }, [events, filterType]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return filteredEvents.filter((e) => e.start_date <= selectedDate && e.end_date >= selectedDate);
  }, [selectedDate, filteredEvents]);

  const toggleAssignee = (id: string) => {
    setForm((f) => ({
      ...f,
      assignedIds: f.assignedIds.includes(id)
        ? f.assignedIds.filter((x) => x !== id)
        : [...f.assignedIds, id],
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">To create a new task for everyone</p>
        </div>
        {!isStaff && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                <Plus className="h-4 w-4 mr-2" /> Add New Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Create New Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Task details and purpose..." rows={3} />
                </div>
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                  {form.start_date && isHolidayDate(form.start_date) && (
                    <p className="text-xs text-destructive mt-1">ပိတ်ရက်မှာ New Task လုပ်ခွင့် မပြုပါ</p>
                  )}
                </div>
                <div>
                  <Label>Frequency</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as "weekly" | "biweekly" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">1 Task per Week (max 4/month)</SelectItem>
                      <SelectItem value="biweekly">1 Task per 2 Weeks (max 2/month)</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.start_date && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Deadline: {computeDeadline(form.start_date, form.frequency)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.allStaff} onCheckedChange={(c) => setForm({ ...form, allStaff: c })} />
                    <Label>Assign to all staff</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Monthly cap per person: 4 weekly tasks, or 2 bi-weekly, or a mix (weekly = 1 unit, bi-weekly = 2 units, max 4 units/month).
                  </p>
                  {form.allStaff ? (
                    <div className="border border-border rounded-md p-3 max-h-40 overflow-y-auto space-y-1">
                      {staffList.length === 0 && <p className="text-sm text-muted-foreground">No staff found</p>}
                      {staffList.map((s) => {
                        const l = assignmentLoad[s.id] || { weekly: 0, biweekly: 0, weighted: 0 };
                        const newWeight = form.frequency === "weekly" ? 1 : 2;
                        const willExceed = l.weighted + newWeight > MONTHLY_WEIGHT_CAP;
                        return (
                          <div key={s.id} className="flex items-center justify-between text-xs">
                            <span>{s.full_name || "Unnamed"}</span>
                            <span className={willExceed ? "text-destructive font-medium" : "text-muted-foreground"}>
                              {l.weekly}w + {l.biweekly}bw = {l.weighted}/{MONTHLY_WEIGHT_CAP}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="border border-border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                      {staffList.length === 0 && <p className="text-sm text-muted-foreground">No staff found</p>}
                      {staffList.map((s) => {
                        const l = assignmentLoad[s.id] || { weekly: 0, biweekly: 0, weighted: 0 };
                        const newWeight = form.frequency === "weekly" ? 1 : 2;
                        const willExceed = l.weighted + newWeight > MONTHLY_WEIGHT_CAP;
                        return (
                          <label key={s.id} className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                            <span className="flex items-center gap-2">
                              <Checkbox
                                checked={form.assignedIds.includes(s.id)}
                                onCheckedChange={() => toggleAssignee(s.id)}
                              />
                              {s.full_name || "Unnamed"}
                            </span>
                            <span className={`text-xs ${willExceed ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              {l.weekly}w + {l.biweekly}bw = {l.weighted}/{MONTHLY_WEIGHT_CAP}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={submitting || !form.title || !form.start_date || isHolidayDate(form.start_date)}
                  className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Task
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Permanent task rules notice (always visible) */}
      <Card className="border-l-4 border-l-secondary border border-border bg-secondary/5 shadow-none">
        <CardContent className="p-4 space-y-2 text-sm leading-relaxed">
          <p>
            Admin နှင့် Assistant Admin တို့သည် Weekend ပိတ်ရက်များတွင် Member တယောက်ချင်းစီတိုင်းကို ကျောင်းအတွက် သို့ သူတို့အတွက် ဆောင်ရွက် လုပ်ကိုင်စေလိုသည့် Task တခုခုကို သတ်မှတ်ပေးရမည်။
          </p>
          <p>
            မသတ်မှတ်လျှင် သတ်မှတ်ထားသည့် Bonus များမှ တပတ်ကို တခါနှုန်းဖြင့် Member များ၏ လစဉ်နောက်ဆုံးပိတ် Salary ထဲသို့ System မှ အလိုအလျောက် ပေါင်းထည့်သွားပါမည်။
          </p>
        </CardContent>
      </Card>

      {/* Monthly Calendar Grid */}
      <Card className="border border-border shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base font-display">
            {currentDate.toLocaleString("default", { month: "long", year: "numeric" })}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px">
            {daysOfWeek.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-12 md:h-16" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = getEventsForDay(day);
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              const isSelected = selectedDate === dateStr;
              const weekdayName = WEEKDAY_NAMES[new Date(year, month, day).getDay()];
              const isOffDay = !!mySchedule && mySchedule[weekdayName] && mySchedule[weekdayName].active === false;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`h-12 md:h-16 flex flex-col items-center justify-start pt-1 rounded-md text-sm transition-colors
                    ${isOffDay ? "bg-destructive/15 text-destructive" : ""}
                    ${isSelected ? "ring-2 ring-secondary bg-secondary/10" : ""}
                    ${isToday && !isSelected ? "bg-accent" : ""}
                    hover:bg-accent/50`}
                >
                  <span className={`${isToday ? "font-bold text-secondary" : ""}`}>{day}</span>
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                    {isOffDay && (
                      <div className="h-1.5 w-1.5 rounded-full bg-destructive" title="Day off" />
                    )}
                    {dayEvents.slice(0, 3).map((e) => (
                      <div key={e.id} className={`h-1.5 w-1.5 rounded-full ${EVENT_DOT_COLORS[e.event_type] || "bg-muted-foreground"}`} title={e.title} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Daily View */}
      {selectedDate && (
        <Card className="border border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <CalIcon className="h-4 w-4" />
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("default", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const weekdayName = WEEKDAY_NAMES[new Date(selectedDate + "T00:00:00").getDay()];
              const isOffDay = !!mySchedule && mySchedule[weekdayName] && mySchedule[weekdayName].active === false;
              return (
                <div className="space-y-3">
                  {isOffDay && (
                    <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/40 bg-destructive/10">
                      <Badge className="bg-destructive text-destructive-foreground shrink-0 mt-0.5">holiday</Badge>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">Day off</p>
                        <p className="text-xs text-muted-foreground mt-1">{weekdayName} is set as a non-working day in your schedule.</p>
                      </div>
                    </div>
                  )}
                  {selectedDayEvents.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                      <Badge className={`${EVENT_COLORS[e.event_type] || "bg-muted"} shrink-0 mt-0.5`}>
                        {e.event_type}
                      </Badge>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{e.title}</p>
                        {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {e.start_date === e.end_date ? e.start_date : `${e.start_date} → ${e.end_date}`}
                          {e.visibility === "private" && " • 🔒 Private"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!isOffDay && selectedDayEvents.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No events on this date</p>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Holiday</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Meeting</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Event</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Task</span>
      </div>
    </div>
  );
}
