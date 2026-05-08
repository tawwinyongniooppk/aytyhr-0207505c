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
  const { isAdmin, isStaff } = useProfile();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [mySchedule, setMySchedule] = useState<Record<string, { active: boolean }> | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const [form, setForm] = useState({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    event_type: "event",
    visibility: "public",
    allStaff: true,
    assignedIds: [] as string[],
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  useEffect(() => {
    loadEvents();
    loadMySchedule();
    if (!isStaff) loadStaff();
  }, [user, isStaff]);

  // Realtime: refresh schedule when profile work_schedule changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("profile-schedule-sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload: any) => {
          const ws = payload?.new?.work_schedule;
          if (ws) setMySchedule(ws);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function loadMySchedule() {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("work_schedule")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.work_schedule) setMySchedule(data.work_schedule as any);
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
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "staff");
      setStaffList(data || []);
    } catch { /* ignore */ }
  }


  async function handleCreate() {
    if (!form.title || !form.start_date || !form.end_date || !user) return;
    setSubmitting(true);
    try {
      const needsAssignments = form.visibility === "private" || form.event_type === "task";
      const isAllStaff = needsAssignments && form.allStaff;

      const { data: ev, error } = await supabase
        .from("calendar_events")
        .insert({
          title: form.title,
          description: form.description,
          start_date: form.start_date,
          end_date: form.end_date,
          event_type: form.event_type,
          visibility: form.visibility,
          created_by: user.id,
          assigned_to_all: isAllStaff,
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Insert assignments for private events OR for tasks (tasks must always be assigned to staff)
      if (ev && needsAssignments) {
        const ids = form.allStaff ? staffList.map((s) => s.id) : form.assignedIds;
        console.log("[CalendarPage] Created event:", ev.id, "type:", form.event_type, "assigning to:", ids);
        if (ids.length > 0) {
          const { error: assignErr } = await supabase.from("calendar_event_assignments").insert(
            ids.map((uid) => ({ event_id: ev.id, user_id: uid, submission_status: "not_started" }))
          );
          if (assignErr) {
            console.error("[CalendarPage] Failed to insert assignments:", assignErr);
            throw assignErr;
          }
        } else {
          console.warn("[CalendarPage] Task created with no assignees");
        }
      }

      toast({ title: "Event created successfully" });
      setForm({ title: "", description: "", start_date: "", end_date: "", event_type: "event", visibility: "public", allStaff: true, assignedIds: [] });
      setOpen(false);
      loadEvents();
    } catch {
      toast({ title: "Error", description: "Failed to create event", variant: "destructive" });
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
          <p className="text-muted-foreground text-sm mt-1">School events & holidays</p>
        </div>
        {!isStaff && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                <Plus className="h-4 w-4 mr-2" /> Add New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Create Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Details..." rows={3} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Event Type</Label>
                  <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">📅 Event</SelectItem>
                      <SelectItem value="holiday">🏖 Holiday</SelectItem>
                      <SelectItem value="meeting">📋 Meeting</SelectItem>
                      <SelectItem value="task">📝 Task</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Visibility</Label>
                  <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">🌐 Public (all staff)</SelectItem>
                      <SelectItem value="private">🔒 Private (assigned only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(form.visibility === "private" || form.event_type === "task") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={form.allStaff} onCheckedChange={(c) => setForm({ ...form, allStaff: c })} />
                      <Label>Assign to all staff</Label>
                    </div>
                    {!form.allStaff && (
                      <div className="border border-border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                        {staffList.length === 0 && <p className="text-sm text-muted-foreground">No staff found</p>}
                        {staffList.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={form.assignedIds.includes(s.id)}
                              onCheckedChange={() => toggleAssignee(s.id)}
                            />
                            {s.full_name || "Unnamed"}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <Button onClick={handleCreate} disabled={submitting || !form.title || !form.start_date || !form.end_date} className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Event
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filter bar (admin/assistant) */}
      {!isStaff && (
        <div className="flex gap-2 flex-wrap">
          {["all", "event", "holiday", "meeting", "task"].map((t) => (
            <Button key={t} size="sm" variant={filterType === t ? "default" : "outline"} onClick={() => setFilterType(t)}
              className={filterType === t ? "bg-secondary text-secondary-foreground" : ""}>
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      )}

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

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`h-12 md:h-16 flex flex-col items-center justify-start pt-1 rounded-md text-sm transition-colors
                    ${isSelected ? "ring-2 ring-secondary bg-secondary/10" : ""}
                    ${isToday && !isSelected ? "bg-accent" : ""}
                    hover:bg-accent/50`}
                >
                  <span className={`${isToday ? "font-bold text-secondary" : ""}`}>{day}</span>
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
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
            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No events on this date</p>
            ) : (
              <div className="space-y-3">
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
              </div>
            )}
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
