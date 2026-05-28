import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { sendPush } from "@/lib/push";
import { toMyanmarDate, getMyanmarHoliday } from "@/lib/mmCalendar";

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
  sequence?: number;
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
  const [memberStats, setMemberStats] = useState<Record<string, { newTask: number; inProgress: number; submitted: number; overdue: number; reject: number; allDone: number }>>({});

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
    assignMode: "everyone" as "everyone" | "single_private" | "single_public",
  });

  function addDaysISO(dateStr: string, days: number) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }

  // Deadline rules (per spec, based on the task's start month):
  //   weekly:   start + 6 days  (start + 4 in February)
  //   biweekly: start + 13 days (start + 11 in February)
  function computeDeadline(startDate: string, frequency: "weekly" | "biweekly") {
    if (!startDate) return "";
    const isFeb = new Date(startDate + "T00:00:00").getMonth() === 1;
    const offset =
      frequency === "weekly"
        ? (isFeb ? 4 : 6)
        : (isFeb ? 11 : 13);
    return addDaysISO(startDate, offset);
  }

  // Date-picker bounds: only the current month is selectable (today .. end of month)
  function todayISO() {
    return new Date().toISOString().split("T")[0];
  }
  function currentMonthEndISO() {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return last.toISOString().split("T")[0];
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
  }, [user, isStaff, isAssistant, year, month]);

  // Refresh schedule when the tab becomes visible again (cheaper than realtime).
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") loadMySchedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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
    if (!user) return;
    try {
      // Restrict to the currently viewed month (with a small buffer for multi-day events).
      const rangeStart = new Date(year, month, 1);
      const rangeEnd = new Date(year, month + 1, 0); // last day of month
      const startStr = rangeStart.toISOString().split("T")[0];
      const endStr = rangeEnd.toISOString().split("T")[0];

      // Events overlapping the visible month: start_date <= endStr AND end_date >= startStr
      const baseQuery = supabase
        .from("calendar_events")
        .select("*")
        .lte("start_date", endStr)
        .gte("end_date", startStr)
        .order("start_date", { ascending: true });

      if (isStaff) {
        // Staff: fetch only events visible to them in this month.
        // 1) public / assigned-to-all
        // 2) events they have a personal assignment to
        const { data: myAss } = await supabase
          .from("calendar_event_assignments")
          .select("event_id")
          .eq("user_id", user.id);
        const myEventIds = Array.from(new Set((myAss || []).map((a: any) => a.event_id))).filter(Boolean);

        const orParts = ["visibility.eq.public", "assigned_to_all.eq.true"];
        if (myEventIds.length > 0) {
          orParts.push(`id.in.(${myEventIds.join(",")})`);
        }
        const { data, error } = await baseQuery.or(orParts.join(","));
        if (error) throw error;
        setEvents((data as CalEvent[]) || []);
      } else {
        const { data, error } = await baseQuery;
        if (error) throw error;
        setEvents((data as CalEvent[]) || []);
      }
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
        .select("id, full_name, role, sequence, work_schedule")
        .in("role", roles)
        .order("sequence", { ascending: true })
        .order("full_name", { ascending: true });
      setStaffList((data as StaffProfile[]) || []);
    } catch { /* ignore */ }
  }

  // Per-assignee monthly load: weekly=1 weighted unit, biweekly=2; cap = 4 weighted units / month / person.
  const MONTHLY_WEIGHT_CAP = 4;
  // Admin/Assistant can only assign tasks on these days of the month.
  const ALLOWED_ASSIGN_DAYS = [1, 2, 3, 8, 9, 10, 15, 16, 17, 22, 23, 24];
  // Assignment windows for "auto All-Done if no task assigned in window".
  const ASSIGN_WINDOWS: Array<[number, number]> = [
    [1, 3], [8, 10], [15, 17], [22, 24],
  ];
  function monthBoundsFor(dateStr: string) {
    const monthStart = (dateStr || new Date().toISOString().split("T")[0]).slice(0, 7) + "-01";
    const d = new Date(monthStart + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    return { monthStart, nextMonthStart: d.toISOString().split("T")[0] };
  }

  async function loadAssignmentLoad(dateStr: string) {
    try {
      const { monthStart, nextMonthStart } = monthBoundsFor(dateStr);
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: taskEvents } = await supabase
        .from("calendar_events")
        .select("id, start_date, end_date")
        .eq("event_type", "task")
        .gte("start_date", monthStart)
        .lt("start_date", nextMonthStart);
      const evList = (taskEvents as { id: string; start_date: string; end_date: string }[]) || [];
      // Don't early-return on empty list — we still want to compute auto All-Done units.
      const evMap = new Map(evList.map((e) => [e.id, e]));
      let assList: Array<{ user_id: string; event_id: string; submission_status: string }> = [];
      if (evList.length > 0) {
        const { data: ass } = await supabase
          .from("calendar_event_assignments")
          .select("user_id, event_id, submission_status")
          .in("event_id", evList.map((e) => e.id));
        assList = (ass as any) || [];
      }
      const load: Record<string, { weekly: number; biweekly: number; weighted: number }> = {};
      const stats: Record<string, { newTask: number; inProgress: number; submitted: number; overdue: number; reject: number; allDone: number }> = {};
      for (const a of assList) {
        const ev = evMap.get(a.event_id);
        if (!ev) continue;
        const days = Math.round(
          (new Date(ev.end_date + "T00:00:00").getTime() - new Date(ev.start_date + "T00:00:00").getTime()) / 86400000
        );
        const isBiweekly = days >= 13;
        const unit = isBiweekly ? 2 : 1;

        // Weighted total = sum of all assigned units (cap check basis).
        const entry = load[a.user_id] || { weekly: 0, biweekly: 0, weighted: 0 };
        if (isBiweekly) { entry.biweekly += 1; entry.weighted += 2; }
        else { entry.weekly += 1; entry.weighted += 1; }
        load[a.user_id] = entry;

        // Mutually-exclusive status bucket — each task's units land in exactly ONE column.
        const status = a.submission_status || "not_started";
        const s = stats[a.user_id] || { newTask: 0, inProgress: 0, submitted: 0, overdue: 0, reject: 0, allDone: 0 };
        if (status === "approved") {
          s.allDone += unit;
        } else if (status === "rejected") {
          s.reject += unit;
        } else if (status === "submitted") {
          s.submitted += unit;
        } else if (status === "in_progress") {
          if (ev.end_date < todayStr) s.overdue += unit;
          else s.inProgress += unit;
        } else {
          // not_started / new
          if (ev.end_date < todayStr) s.overdue += unit;
          else s.newTask += unit;
        }
        stats[a.user_id] = s;
      }
      setAssignmentLoad(load);
      setMemberStats(stats);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (isStaff) return;
    if (!open) return;
    loadAssignmentLoad(form.start_date || new Date().toISOString().split("T")[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.start_date, isStaff, staffList]);


  function isHolidayDate(dateStr: string) {
    if (!dateStr) return false;
    if (getMyanmarHoliday(dateStr)) return true;
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

    // (3) Restrict to current month only — no future months allowed.
    const todayStr = todayISO();
    const monthEndStr = currentMonthEndISO();
    if (form.start_date < todayStr || form.start_date > monthEndStr) {
      toast({
        title: "Error: Start date must be within the current month.",
        variant: "destructive",
      });
      return;
    }

    const deadline = computeDeadline(form.start_date, form.frequency);

    // Per-assignee monthly cap (weekly=1 weighted unit, biweekly=2; cap 4/month).
    const newWeight = form.frequency === "weekly" ? 1 : 2;
    const isEveryone = form.assignMode === "everyone";
    const candidateIds = isEveryone ? staffList.map((s) => s.id) : form.assignedIds;
    if (candidateIds.length === 0) {
      toast({ title: "Select at least one assignee", variant: "destructive" });
      return;
    }
    if (!isEveryone && candidateIds.length !== 1) {
      toast({ title: "Pick exactly one staff member for this mode", variant: "destructive" });
      return;
    }

    // (3a) Start day must not fall on an assignee's Off Day.
    const startWeekday = WEEKDAY_NAMES[new Date(form.start_date + "T00:00:00").getDay()];
    const nameById: Record<string, string> = Object.fromEntries(
      staffList.map((s) => [s.id, s.full_name || "Unnamed"]),
    );
    const offBlocked = candidateIds.filter((id) => {
      const sched = staffList.find((s) => s.id === id)?.work_schedule as
        | Record<string, { active: boolean }>
        | undefined;
      // If the day is explicitly marked inactive on their schedule → off day.
      return sched?.[startWeekday]?.active === false;
    });
    if (offBlocked.length > 0) {
      toast({
        title: "Error: Cannot assign task. Start date falls on an Off Day.",
        description: offBlocked.map((id) => nameById[id] || "user").join(", "),
        variant: "destructive",
      });
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
    let assRows: Array<{ user_id: string; event_id: string; submission_status: string }> = [];
    if (freshList.length) {
      const { data: ass } = await supabase
        .from("calendar_event_assignments")
        .select("user_id, event_id, submission_status")
        .in("event_id", freshList.map((e) => e.id));
      assRows = (ass as any) || [];
      for (const a of assRows) {
        const ev = freshMap.get(a.event_id);
        if (!ev) continue;
        const days = Math.round(
          (new Date(ev.end_date + "T00:00:00").getTime() - new Date(ev.start_date + "T00:00:00").getTime()) / 86400000
        );
        freshLoad[a.user_id] = (freshLoad[a.user_id] || 0) + (days >= 13 ? 2 : 1);
      }
    }

    // (2) Date-range overlap with existing INCOMPLETE tasks for any selected assignee.
    // A task is "incomplete" until its assignment row reaches 'approved'.
    const newStart = form.start_date;
    const newEnd = deadline;
    const overlappedNames = new Set<string>();
    for (const a of assRows) {
      if (!candidateIds.includes(a.user_id)) continue;
      if (a.submission_status === "approved") continue; // 4/4 = fully complete
      const ev = freshMap.get(a.event_id);
      if (!ev) continue;
      const overlaps = ev.start_date <= newEnd && ev.end_date >= newStart;
      if (overlaps) overlappedNames.add(nameById[a.user_id] || "user");
    }
    if (overlappedNames.size > 0) {
      toast({
        title: "Error: Cannot assign task. Dates overlap with existing or incomplete tasks.",
        description: `Conflict for: ${Array.from(overlappedNames).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    const blocked = candidateIds.filter((id) => (freshLoad[id] || 0) + newWeight > MONTHLY_WEIGHT_CAP);
    if (blocked.length > 0) {
      toast({
        title: "Monthly assignment limit reached (4/4)",
        description: `Blocked: ${blocked.map((id) => nameById[id] || "user").join(", ")}. Other staff can still be assigned.`,
        variant: "destructive",
      });
      return;
    }


    setSubmitting(true);
    try {
      // Mode → visibility:
      //  - everyone: assigned to all staff (private record, but every staff has an assignment)
      //  - single_private: assigned to one staff, only that staff sees it
      //  - single_public: assigned to one staff, visible to the whole team
      const visibility = form.assignMode === "single_public" ? "public" : "private";
      const isAllStaff = form.assignMode === "everyone";

      const { data: ev, error } = await supabase
        .from("calendar_events")
        .insert({
          title: form.title,
          description: form.description,
          start_date: form.start_date,
          end_date: deadline,
          event_type: "task",
          visibility,
          created_by: user.id,
          assigned_to_all: isAllStaff,
        } as any)
        .select()
        .single();
      if (error) throw error;

      if (ev) {
        const ids = isAllStaff ? staffList.map((s) => s.id) : form.assignedIds;
        if (ids.length > 0) {
          const { error: assignErr } = await supabase.from("calendar_event_assignments").insert(
            ids.map((uid) => ({ event_id: ev.id, user_id: uid, submission_status: "not_started" }))
          );
          if (assignErr) throw assignErr;
        }
      }

      toast({ title: "Task created successfully" });
      const recipientIds = isAllStaff ? staffList.map((s) => s.id) : form.assignedIds;
      if (recipientIds.length > 0) {
        sendPush({
          user_ids: recipientIds,
          title: form.event_type === "task" ? "New task assigned" : "New calendar event",
          body: `${form.title} — due ${deadline}`,
          url: "/calendar",
        });
      }
      setForm({ title: "", description: "", start_date: "", end_date: "", event_type: "task", visibility: "private", allStaff: true, assignedIds: [], frequency: "weekly", assignMode: "everyone" });
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
                    min={todayISO()}
                    max={currentMonthEndISO()}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                  {form.start_date && isHolidayDate(form.start_date) && (
                    <p className="text-xs text-destructive mt-1">ပိတ်ရက်မှာ New Task လုပ်ခွင့် မပြုပါ</p>
                  )}
                  {form.start_date &&
                    (form.start_date < todayISO() || form.start_date > currentMonthEndISO()) && (
                      <p className="text-xs text-destructive mt-1">
                        Tasks can only be assigned within the current month.
                      </p>
                    )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Any day of the current month is allowed, as long as it's not an Off Day or overlapping with an existing task.
                  </p>
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
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Assignment Mode</Label>
                  <RadioGroup
                    value={form.assignMode}
                    onValueChange={(v) => setForm({ ...form, assignMode: v as typeof form.assignMode, assignedIds: [] })}
                    className="grid gap-2"
                  >
                    <label className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer transition ${form.assignMode === "everyone" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                      <RadioGroupItem value="everyone" className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Assign to everyone</p>
                        <p className="text-xs text-muted-foreground">Every staff member gets this task.</p>
                      </div>
                    </label>
                    <label className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer transition ${form.assignMode === "single_private" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                      <RadioGroupItem value="single_private" className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Assign to one person only</p>
                        <p className="text-xs text-muted-foreground">Only the chosen staff sees this task.</p>
                      </div>
                    </label>
                    <label className={`flex items-start gap-2 p-3 rounded-md border cursor-pointer transition ${form.assignMode === "single_public" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                      <RadioGroupItem value="single_public" className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Assign to one — visible to team</p>
                        <p className="text-xs text-muted-foreground">One staff is responsible; the rest can see it.</p>
                      </div>
                    </label>
                  </RadioGroup>

                  <p className="text-xs text-muted-foreground">
                    Monthly cap per person: 4 Units (weekly = 1 Unit, bi-weekly = 2 Units). When a member reaches 4/4, only that member is blocked.
                  </p>

                  <div className="border border-border rounded-md p-2 max-h-72 overflow-y-auto space-y-2 bg-muted/20">
                    {staffList.length === 0 && <p className="text-sm text-muted-foreground p-2">No staff found</p>}
                    {staffList.map((s) => {
                      const l = assignmentLoad[s.id] || { weekly: 0, biweekly: 0, weighted: 0 };
                      const stats = memberStats[s.id] || { newTask: 0, inProgress: 0, submitted: 0, overdue: 0, reject: 0, allDone: 0 };
                      const newWeight = form.frequency === "weekly" ? 1 : 2;
                      const willExceed = l.weighted + newWeight > MONTHLY_WEIGHT_CAP;
                      const atCap = l.weighted >= MONTHLY_WEIGHT_CAP;
                      const selectable = form.assignMode !== "everyone";
                      const selected = form.assignedIds.includes(s.id);
                      const pickOne = () => {
                        if (atCap) return;
                        setForm((f) => ({ ...f, assignedIds: selected ? [] : [s.id] }));
                      };
                      const cols: Array<{ label: string; value: number; cls: string }> = [
                        { label: "New Task", value: stats.newTask, cls: "bg-muted text-muted-foreground" },
                        { label: "In Progress", value: stats.inProgress, cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                        { label: "Submitted", value: stats.submitted, cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
                        { label: "Overdue", value: stats.overdue, cls: "bg-destructive/10 text-destructive" },
                        { label: "Reject", value: stats.reject, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                        { label: "All Done", value: stats.allDone, cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                      ];
                      return (
                        <div
                          key={s.id}
                          onClick={selectable ? pickOne : undefined}
                          className={`rounded-md border bg-background px-3 py-2 ${selectable ? "cursor-pointer hover:bg-muted/40" : ""} ${selected && selectable ? "ring-1 ring-primary border-primary/40 bg-primary/5" : "border-border"} ${atCap ? "opacity-70" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 min-w-0">
                              {selectable && (
                                <Checkbox checked={selected} disabled={atCap} onCheckedChange={pickOne} />
                              )}
                              <span className="text-[10px] font-bold text-muted-foreground w-5 shrink-0">#{s.sequence ?? "—"}</span>
                              <span className="font-medium text-sm truncate">{s.full_name || "Unnamed"}</span>
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${stats.allDone >= MONTHLY_WEIGHT_CAP ? "bg-destructive/15 text-destructive" : atCap ? "bg-destructive/15 text-destructive" : willExceed ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent"}`}>
                              {Math.min(stats.allDone, MONTHLY_WEIGHT_CAP)}/{MONTHLY_WEIGHT_CAP} Unit{stats.allDone === 1 ? "" : "s"}
                              {stats.allDone >= MONTHLY_WEIGHT_CAP && " · Full"}
                            </span>
                          </div>
                          <div className="grid grid-cols-6 gap-1 mt-2">
                            {cols.map((c) => (
                              <div key={c.label} className={`flex flex-col items-center justify-center rounded px-1 py-1 ${c.cls}`}>
                                <span className="text-[9px] uppercase tracking-wider opacity-80 leading-none">{c.label}</span>
                                <span className="text-sm font-bold leading-tight mt-0.5">{c.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={
                    submitting ||
                    !form.title ||
                    !form.start_date ||
                    isHolidayDate(form.start_date) ||
                    form.start_date < todayISO() ||
                    form.start_date > currentMonthEndISO()
                  }
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

      {/* iOS-style Monthly Calendar */}
      <Card className="border border-border shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 pt-4 px-4">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {currentDate.toLocaleString("default", { month: "long" })}
            </CardTitle>
            <span className="text-2xl font-light text-muted-foreground">{year}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
              onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date().toISOString().split("T")[0]); }}
            >
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-3 pb-3">
          <div className="grid grid-cols-7 border-b border-border/60">
            {daysOfWeek.map((d, i) => (
              <div
                key={d}
                className={`text-center text-[11px] font-medium tracking-wider uppercase py-2 ${i === 0 ? "text-destructive/80" : "text-muted-foreground"}`}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-14 sm:h-20 border-b border-border/40" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = getEventsForDay(day);
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              const isSelected = selectedDate === dateStr;
              const dow = new Date(year, month, day).getDay();
              const weekdayName = WEEKDAY_NAMES[dow];
              const mmHoliday = getMyanmarHoliday(dateStr);
              const isScheduledOff = !!mySchedule && mySchedule[weekdayName] && mySchedule[weekdayName].active === false;
              const isOffDay = isScheduledOff || !!mmHoliday;
              const mmDateText = toMyanmarDate(new Date(year, month, day));
              const mmDayOnly = mmDateText.split(" ")[0] || "";
              const isSunday = dow === 0;

              const numClasses = [
                "flex items-center justify-center h-7 w-7 rounded-full text-sm font-medium leading-none",
                isToday ? "bg-destructive text-destructive-foreground" :
                  isSelected ? "bg-foreground text-background" :
                    (mmHoliday || isSunday) ? "text-destructive" : "text-foreground",
              ].join(" ");

              const offHighlight = isOffDay && !isStaff;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  title={mmHoliday || (offHighlight ? `Off: ${(offStaffByWeekday[weekdayName] || []).join(", ") || "Day off"}` : undefined)}
                  className={`relative h-14 sm:h-20 flex flex-col items-center justify-start pt-1.5 border-b border-border/40 transition-colors ${offHighlight ? "bg-destructive/15 hover:bg-destructive/20" : "hover:bg-muted/40"}`}
                >
                  <span className={numClasses}>{day}</span>
                  {mmDayOnly && (
                    <span className={`text-[10px] mt-0.5 leading-none ${mmHoliday || isSunday ? "text-destructive/70" : "text-muted-foreground"}`} lang="my">
                      {mmDayOnly}
                    </span>
                  )}
                  <div className="flex gap-0.5 mt-auto mb-1.5 flex-wrap justify-center px-1">
                    {isOffDay && !offHighlight && (
                      <div className="h-1 w-1 rounded-full bg-destructive" />
                    )}
                    {dayEvents.slice(0, 3).map((e) => (
                      <div key={e.id} className={`h-1 w-1 rounded-full ${EVENT_DOT_COLORS[e.event_type] || "bg-muted-foreground"}`} title={e.title} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Daily View — iOS style */}
      {selectedDate && (() => {
        const sd = new Date(selectedDate + "T00:00:00");
        const weekdayName = WEEKDAY_NAMES[sd.getDay()];
        const isScheduledOff = !!mySchedule && mySchedule[weekdayName] && mySchedule[weekdayName].active === false;
        const mmHoliday = getMyanmarHoliday(selectedDate);
        const isOffDay = isScheduledOff || !!mmHoliday;
        const mmDate = toMyanmarDate(sd);

        return (
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{weekdayName}</p>
                  <CardTitle className="text-xl font-semibold flex items-baseline gap-2">
                    <CalIcon className="h-4 w-4 text-muted-foreground" />
                    {sd.toLocaleDateString("default", { month: "long", day: "numeric", year: "numeric" })}
                  </CardTitle>
                </div>
                {mmDate && (
                  <p className="text-sm text-muted-foreground" lang="my">{mmDate}</p>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {isOffDay && (
                  <div className="flex items-start gap-3 p-3 rounded-xl border border-destructive/30 bg-destructive/5">
                    <Badge className="bg-destructive text-destructive-foreground shrink-0 mt-0.5">Off Day</Badge>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{mmHoliday || "Day off"}</p>
                      {mmHoliday ? (
                        <p className="text-xs text-muted-foreground mt-1">Myanmar gazette / public holiday — automatically marked as Off Day.</p>
                      ) : !isStaff && offStaffByWeekday[weekdayName]?.length ? (
                        <p className="text-xs text-muted-foreground mt-1">Off for: {offStaffByWeekday[weekdayName].join(", ")}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">{weekdayName} is set as a non-working day in your schedule.</p>
                      )}
                    </div>
                  </div>
                )}
                {selectedDayEvents.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card">
                    <Badge className={`${EVENT_COLORS[e.event_type] || "bg-muted"} shrink-0 mt-0.5 capitalize`}>
                      {e.event_type}
                    </Badge>
                    <div className="min-w-0 flex-1">
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
                  <p className="text-sm text-muted-foreground py-6 text-center">No events on this date</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" /> Holiday / Off Day</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Meeting</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Event</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" /> Task</span>
      </div>

    </div>
  );
}
