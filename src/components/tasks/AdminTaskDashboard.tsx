import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Users, CalendarDays, Filter, AlertTriangle, X, CheckCircle2, Clock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  assigned_by: string;
  completed: boolean;
  created_at: string;
  due_date?: string | null;
  submission_status: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
}

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

interface EventAssignment {
  event_id: string;
  user_id: string;
  submission_status?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  id?: string;
}

interface StaffMember {
  id: string;
  full_name: string;
}

interface UnifiedItem {
  id: string;
  title: string;
  description: string;
  type: "task" | "meeting" | "event" | "holiday";
  date: string;
  dueDate?: string | null;
  staffId: string;
  staffName: string;
  status: "pending" | "submitted" | "approved" | "overdue";
  source: "task" | "calendar";
  sourceId: string;
  assignmentId?: string;
}

const TYPE_COLORS: Record<string, string> = {
  task: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  meeting: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  event: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  holiday: "bg-destructive/10 text-destructive",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-destructive/10 text-destructive",
  overdue: "bg-destructive text-destructive-foreground",
  submitted: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  approved: "bg-accent/10 text-accent",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: null,
  overdue: <AlertTriangle className="h-3 w-3 mr-1" />,
  submitted: <Clock className="h-3 w-3 mr-1" />,
  approved: <CheckCircle2 className="h-3 w-3 mr-1" />,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  overdue: "Overdue",
  submitted: "Submitted",
  approved: "Approved",
};

interface AdminTaskDashboardProps {
  tasks: TaskRow[];
  calendarEvents: CalEvent[];
  eventAssignments: EventAssignment[];
  staffList: StaffMember[];
  staffNames: Record<string, string>;
  onAssignTask: (form: { title: string; description: string; assignee_id: string; due_date?: string }) => Promise<void>;
  submitting: boolean;
  onRefresh: () => void;
}

export function AdminTaskDashboard({
  tasks,
  calendarEvents,
  eventAssignments,
  staffList,
  staffNames,
  onAssignTask,
  submitting,
  onRefresh,
}: AdminTaskDashboardProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assignee_id: "", due_date: "" });
  const [filterStaff, setFilterStaff] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const nowDate = new Date().toISOString().split("T")[0];

  function getItemStatus(submissionStatus: string, dueDate?: string | null): UnifiedItem["status"] {
    if (submissionStatus === "approved") return "approved";
    if (submissionStatus === "submitted") return "submitted";
    if (dueDate && dueDate < nowDate) return "overdue";
    return "pending";
  }

  const unifiedItems = useMemo(() => {
    const items: UnifiedItem[] = [];

    tasks.forEach((t) => {
      items.push({
        id: t.id,
        title: t.title,
        description: t.description,
        type: "task",
        date: t.created_at.split("T")[0],
        dueDate: t.due_date,
        staffId: t.assignee_id,
        staffName: staffNames[t.assignee_id] || "Unknown",
        status: getItemStatus(t.submission_status || "not_submitted", t.due_date),
        source: "task",
        sourceId: t.id,
      });
    });

    calendarEvents.forEach((ev) => {
      const evType = (ev.event_type === "task" ? "task" : ev.event_type) as UnifiedItem["type"];
      if (ev.visibility === "public") {
        staffList.forEach((s) => {
          const assignment = eventAssignments.find(a => a.event_id === ev.id && a.user_id === s.id);
          items.push({
            id: `${ev.id}-${s.id}`,
            title: ev.title,
            description: ev.description,
            type: evType === "task" ? "event" : evType,
            date: ev.start_date,
            dueDate: ev.end_date,
            staffId: s.id,
            staffName: s.full_name || "Unknown",
            status: getItemStatus(assignment?.submission_status || "not_submitted", ev.end_date),
            source: "calendar",
            sourceId: ev.id,
            assignmentId: assignment?.id,
          });
        });
      } else {
        const assigned = eventAssignments.filter((a) => a.event_id === ev.id);
        assigned.forEach((a) => {
          items.push({
            id: `${ev.id}-${a.user_id}`,
            title: ev.title,
            description: ev.description,
            type: evType === "task" ? "event" : evType,
            date: ev.start_date,
            dueDate: ev.end_date,
            staffId: a.user_id,
            staffName: staffNames[a.user_id] || "Unknown",
            status: getItemStatus(a.submission_status || "not_submitted", ev.end_date),
            source: "calendar",
            sourceId: ev.id,
            assignmentId: a.id,
          });
        });
      }
    });

    return items;
  }, [tasks, calendarEvents, eventAssignments, staffList, staffNames, nowDate]);

  const filtered = useMemo(() => {
    return unifiedItems.filter((item) => {
      if (filterStaff !== "all" && item.staffId !== filterStaff) return false;
      if (filterType !== "all" && item.type !== filterType) return false;
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (dateFrom && item.date < dateFrom) return false;
      if (dateTo && item.date > dateTo) return false;
      return true;
    });
  }, [unifiedItems, filterStaff, filterType, filterStatus, dateFrom, dateTo]);

  const byStaff = useMemo(() => {
    const map: Record<string, UnifiedItem[]> = {};
    filtered.forEach((item) => {
      if (!map[item.staffId]) map[item.staffId] = [];
      map[item.staffId].push(item);
    });
    return Object.entries(map).sort((a, b) => (staffNames[a[0]] || "").localeCompare(staffNames[b[0]] || ""));
  }, [filtered, staffNames]);

  const byDate = useMemo(() => {
    const map: Record<string, UnifiedItem[]> = {};
    filtered.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const pendingTasks = unifiedItems.filter(i => i.status === "pending" || i.status === "overdue").length;
  const submittedTasks = unifiedItems.filter(i => i.status === "submitted").length;
  const approvedTasks = unifiedItems.filter(i => i.status === "approved").length;

  const incompleteByStaff = useMemo(() => {
    const map: Record<string, number> = {};
    unifiedItems.filter(i => i.status === "pending" || i.status === "overdue").forEach(i => {
      map[i.staffId] = (map[i.staffId] || 0) + 1;
    });
    return map;
  }, [unifiedItems]);

  async function handleApprove(item: UnifiedItem) {
    if (!user) return;
    setApprovingId(item.id);
    try {
      if (item.source === "task") {
        const { error } = await supabase
          .from("tasks")
          .update({ submission_status: "approved", approved_at: new Date().toISOString(), approved_by: user.id })
          .eq("id", item.sourceId);
        if (error) throw error;
      } else if (item.assignmentId) {
        const { error } = await supabase
          .from("calendar_event_assignments")
          .update({ submission_status: "approved", approved_at: new Date().toISOString(), approved_by: user.id })
          .eq("id", item.assignmentId);
        if (error) throw error;
      }
      toast.success("Approved successfully");
      onRefresh();
    } catch {
      toast.error("Failed to approve");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleAdd() {
    if (!form.title || !form.assignee_id) return;
    await onAssignTask({ ...form });
    setForm({ title: "", description: "", assignee_id: "", due_date: "" });
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display">Task Monitor</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">{pendingTasks} pending</Badge>
            <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs">{submittedTasks} submitted</Badge>
            <Badge variant="secondary" className="bg-accent/10 text-accent text-xs">{approvedTasks} approved</Badge>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Assign Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Assign Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Task Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" />
              </div>
              <div>
                <Label>Instructions / What to do</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe what needs to be done..." rows={3} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div>
                <Label>Assign To</Label>
                <Select value={form.assignee_id} onValueChange={(v) => setForm({ ...form, assignee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name || "Unnamed"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={submitting || !form.title || !form.assignee_id} className="w-full">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Assigning...</> : "Assign"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={filterStaff} onValueChange={setFilterStaff}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Staff" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffList.map((s) => (<SelectItem key={s.id} value={s.id}>{s.full_name || "Unnamed"}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="task">Tasks</SelectItem>
                <SelectItem value="meeting">Meetings</SelectItem>
                <SelectItem value="event">Events</SelectItem>
                <SelectItem value="holiday">Holidays</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
            {(filterStaff !== "all" || filterType !== "all" || filterStatus !== "all" || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterStaff("all"); setFilterType("all"); setFilterStatus("all"); setDateFrom(""); setDateTo(""); }} className="gap-1 text-xs">
                <X className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="by-staff" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="by-staff" className="gap-1"><Users className="h-4 w-4" /> By Staff</TabsTrigger>
          <TabsTrigger value="by-date" className="gap-1"><CalendarDays className="h-4 w-4" /> By Date</TabsTrigger>
        </TabsList>

        <TabsContent value="by-staff">
          {byStaff.length === 0 ? <EmptyState /> : (
            <div className="space-y-4">
              {byStaff.map(([staffId, items]) => (
                <Card key={staffId} className="border border-border shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold">{staffNames[staffId] || "Unknown"}</CardTitle>
                      {incompleteByStaff[staffId] ? (
                        <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs gap-1">
                          <AlertTriangle className="h-3 w-3" />{incompleteByStaff[staffId]} incomplete
                        </Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="space-y-1">
                      {items.map((item) => (
                        <ItemRow key={item.id} item={item} showStaff={false} approvingId={approvingId} onApprove={handleApprove} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="by-date">
          {byDate.length === 0 ? <EmptyState /> : (
            <div className="space-y-4">
              {byDate.map(([date, items]) => (
                <Card key={date} className="border border-border shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-base font-semibold">
                      {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="space-y-1">
                      {items.map((item) => (
                        <ItemRow key={item.id} item={item} showStaff approvingId={approvingId} onApprove={handleApprove} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ItemRow({ item, showStaff, approvingId, onApprove }: { item: UnifiedItem; showStaff: boolean; approvingId: string | null; onApprove: (item: UnifiedItem) => void }) {
  return (
    <div
      className={`flex items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${
        item.status === "approved" ? "bg-accent/5"
        : item.status === "submitted" ? "bg-orange-50 dark:bg-orange-950/20"
        : item.status === "overdue" ? "bg-destructive/10 border-l-2 border-l-destructive"
        : "bg-destructive/5 border-l-2 border-l-destructive"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium ${item.status === "approved" ? "line-through text-muted-foreground" : ""}`}>{item.title}</p>
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[item.type] || ""}`}>{item.type}</Badge>
        </div>
        {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {showStaff && <span>👤 {item.staffName}</span>}
          <span>📅 {item.date}</span>
          {item.dueDate && <span>⏰ Due: {item.dueDate}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="secondary" className={`text-xs ${STATUS_COLORS[item.status] || ""}`}>
          {STATUS_ICONS[item.status]}{STATUS_LABELS[item.status]}
        </Badge>
        {item.status === "submitted" && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1 border-accent text-accent hover:bg-accent/10"
            disabled={approvingId === item.id}
            onClick={() => onApprove(item)}
          >
            {approvingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Approve
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border border-border shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <CalendarDays className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No items found</p>
        </div>
      </CardContent>
    </Card>
  );
}
