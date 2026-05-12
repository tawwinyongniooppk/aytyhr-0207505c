import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, Users, CalendarDays, Filter, AlertTriangle, X, CheckCircle2, Clock, Eye } from "lucide-react";
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
  startDate?: string | null;
  dueDate?: string | null;
  staffId: string;
  staffName: string;
  assignedById?: string | null;
  status: "not_started" | "in_progress" | "submitted" | "approved" | "overdue";
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
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  overdue: "bg-destructive text-destructive-foreground",
  submitted: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  not_started: <Eye className="h-3 w-3 mr-1" />,
  in_progress: <Clock className="h-3 w-3 mr-1" />,
  overdue: <AlertTriangle className="h-3 w-3 mr-1" />,
  submitted: <Clock className="h-3 w-3 mr-1" />,
  approved: <CheckCircle2 className="h-3 w-3 mr-1" />,
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
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
  onRefresh,
}: AdminTaskDashboardProps) {
  const { user } = useAuth();
  const [filterStaff, setFilterStaff] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const nowDate = new Date().toISOString().split("T")[0];

  function getItemStatus(submissionStatus: string, dueDate?: string | null): UnifiedItem["status"] {
    if (submissionStatus === "approved") return "approved";
    if (submissionStatus === "submitted") return "submitted";
    if (submissionStatus === "in_progress") return "in_progress";
    if (dueDate && dueDate < nowDate) return "overdue";
    return "not_started";
  }

  function getDeadlinePriority(dueDate?: string | null): number {
    if (!dueDate) return 999999;
    const diff = new Date(dueDate).getTime() - new Date(nowDate).getTime();
    return diff;
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
        startDate: t.created_at.split("T")[0],
        dueDate: t.due_date,
        staffId: t.assignee_id,
        staffName: staffNames[t.assignee_id] || "Unknown",
        assignedById: t.assigned_by,
        status: getItemStatus(t.submission_status || "not_submitted", t.due_date),
        source: "task",
        sourceId: t.id,
      });
    });

    calendarEvents.forEach((ev) => {
      const evType = (ev.event_type as UnifiedItem["type"]) || "event";
      if (ev.visibility === "public") {
        staffList.forEach((s) => {
          const assignment = eventAssignments.find(a => a.event_id === ev.id && a.user_id === s.id);
          items.push({
            id: `${ev.id}-${s.id}`,
            title: ev.title,
            description: ev.description,
            type: evType,
            date: ev.start_date,
            startDate: ev.start_date,
            dueDate: ev.end_date,
            staffId: s.id,
            staffName: s.full_name || "Unknown",
            assignedById: (ev as any).created_by,
            status: getItemStatus(assignment?.submission_status || "not_started", ev.end_date),
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
            type: evType,
            date: ev.start_date,
            startDate: ev.start_date,
            dueDate: ev.end_date,
            staffId: a.user_id,
            staffName: staffNames[a.user_id] || "Unknown",
            assignedById: (ev as any).created_by,
            status: getItemStatus(a.submission_status || "not_started", ev.end_date),
            source: "calendar",
            sourceId: ev.id,
            assignmentId: a.id,
          });
        });
      }
    });

    console.log("[AdminTaskDashboard] unifiedItems:", items.length, "from", tasks.length, "tasks +", calendarEvents.length, "events (", calendarEvents.filter(e => e.event_type === "task").length, "of type=task) +", eventAssignments.length, "assignments");

    return items;
  }, [tasks, calendarEvents, eventAssignments, staffList, staffNames, nowDate]);

  // Sort by deadline priority: overdue first, then nearest deadline
  function sortByPriority(items: UnifiedItem[]): UnifiedItem[] {
    return [...items].sort((a, b) => {
      const statusOrder: Record<string, number> = { overdue: 0, not_started: 1, in_progress: 2, submitted: 3, approved: 4 };
      const sa = statusOrder[a.status] ?? 1;
      const sb = statusOrder[b.status] ?? 1;
      if (sa !== sb) return sa - sb;
      return getDeadlinePriority(a.dueDate) - getDeadlinePriority(b.dueDate);
    });
  }

  const filtered = useMemo(() => {
    const f = unifiedItems.filter((item) => {
      if (filterStaff !== "all" && item.staffId !== filterStaff) return false;
      if (filterStatus !== "all") {
        if (filterStatus === "not_started") {
          if (item.status !== "not_started" && item.status !== "overdue") return false;
        } else if (item.status !== filterStatus) return false;
      }
      if (dateFrom && item.date < dateFrom) return false;
      if (dateTo && item.date > dateTo) return false;
      return true;
    });
    return sortByPriority(f);
  }, [unifiedItems, filterStaff, filterStatus, dateFrom, dateTo]);

  const byStaff = useMemo(() => {
    const map: Record<string, UnifiedItem[]> = {};
    filtered.forEach((item) => {
      if (!map[item.staffId]) map[item.staffId] = [];
      map[item.staffId].push(item);
    });
    // Always show every staff in IT-Manager-defined sequence (filtered by staff filter if set)
    const ordered = staffList
      .filter((s) => filterStaff === "all" || s.id === filterStaff)
      .map((s) => [s.id, map[s.id] || []] as [string, UnifiedItem[]]);
    return ordered;
  }, [filtered, staffList, filterStaff]);

  const byDate = useMemo(() => {
    const map: Record<string, UnifiedItem[]> = {};
    filtered.forEach((item) => {
      const key = item.dueDate || item.date;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Deadline tasks = active items with a due date within 48 hours (2 days), sorted by deadline ascending
  const deadlineItems = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    return filtered
      .filter((i) => {
        if (i.status === "approved") return false;
        if (!i.dueDate) return false;
        const d = new Date(i.dueDate + "T23:59:59");
        return d.getTime() <= cutoff.getTime();
      })
      .sort((a, b) => {
        const da = new Date((a.dueDate || "") + "T23:59:59").getTime();
        const db = new Date((b.dueDate || "") + "T23:59:59").getTime();
        return da - db;
      });
  }, [filtered]);

  const notStartedCount = unifiedItems.filter(i => i.status === "not_started" || i.status === "overdue").length;
  const inProgressCount = unifiedItems.filter(i => i.status === "in_progress").length;
  const submittedCount = unifiedItems.filter(i => i.status === "submitted").length;
  const approvedCount = unifiedItems.filter(i => i.status === "approved").length;

  const incompleteByStaff = useMemo(() => {
    const map: Record<string, number> = {};
    unifiedItems.filter(i => i.status === "not_started" || i.status === "overdue").forEach(i => {
      map[i.staffId] = (map[i.staffId] || 0) + 1;
    });
    return map;
  }, [unifiedItems]);

  const notAcceptedByStaff = useMemo(() => {
    const map: Record<string, number> = {};
    unifiedItems.filter(i => i.status === "not_started").forEach(i => {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display">Task Monitor</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <button type="button" onClick={() => setFilterStatus(filterStatus === "not_started" ? "all" : "not_started")} className={`text-xs px-2 py-1 rounded-md transition ${filterStatus === "not_started" ? "ring-2 ring-ring " : ""}bg-muted text-muted-foreground hover:opacity-80`}>{notStartedCount} not started</button>
          <button type="button" onClick={() => setFilterStatus(filterStatus === "in_progress" ? "all" : "in_progress")} className={`text-xs px-2 py-1 rounded-md transition ${filterStatus === "in_progress" ? "ring-2 ring-ring " : ""}bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:opacity-80`}>{inProgressCount} in progress</button>
          <button type="button" onClick={() => setFilterStatus(filterStatus === "submitted" ? "all" : "submitted")} className={`text-xs px-2 py-1 rounded-md transition ${filterStatus === "submitted" ? "ring-2 ring-ring " : ""}bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:opacity-80`}>{submittedCount} submitted</button>
          <button type="button" onClick={() => setFilterStatus(filterStatus === "approved" ? "all" : "approved")} className={`text-xs px-2 py-1 rounded-md transition ${filterStatus === "approved" ? "ring-2 ring-ring " : ""}bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:opacity-80`}>{approvedCount} approved</button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
            <Filter className="hidden sm:block h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={filterStaff} onValueChange={setFilterStaff}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Staff" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffList.map((s) => (<SelectItem key={s.id} value={s.id}>{s.full_name || "Unnamed"}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-[150px]" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-[150px]" />
            {(filterStaff !== "all" || filterStatus !== "all" || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterStaff("all"); setFilterStatus("all"); setDateFrom(""); setDateTo(""); }} className="gap-1 text-xs col-span-2 sm:col-auto">
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
                      <div className="flex items-center gap-2">
                        {notAcceptedByStaff[staffId] ? (
                          <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs gap-1">
                            <Eye className="h-3 w-3" />{notAcceptedByStaff[staffId]} not accepted
                          </Badge>
                        ) : null}
                        {incompleteByStaff[staffId] ? (
                          <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" />{incompleteByStaff[staffId]} incomplete
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="space-y-1">
                      {items.map((item) => (
                        <ItemRow key={item.id} item={item} showStaff={false} approvingId={approvingId} onApprove={handleApprove} nowDate={nowDate} />
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
                        <ItemRow key={item.id} item={item} showStaff approvingId={approvingId} onApprove={handleApprove} nowDate={nowDate} />
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

function getRowBg(item: { status: string; dueDate?: string | null }, nowDate: string) {
  if (item.status === "approved") return "bg-blue-50 dark:bg-blue-950/20";
  if (item.status === "submitted") return "bg-orange-50 dark:bg-orange-950/20";
  if (item.status === "in_progress") return "bg-green-50 dark:bg-green-950/20 border-l-2 border-l-green-500";
  if (item.status === "overdue") return "bg-destructive/10 border-l-2 border-l-destructive";
  // not_started — check if deadline is near
  if (item.dueDate) {
    const diff = Math.ceil((new Date(item.dueDate).getTime() - new Date(nowDate).getTime()) / 86400000);
    if (diff <= 2) return "bg-destructive/10 border-l-2 border-l-destructive";
  }
  return "bg-muted/30 border-l-2 border-l-muted-foreground/30";
}

function ItemRow({ item, showStaff, approvingId, onApprove, nowDate }: { item: UnifiedItem; showStaff: boolean; approvingId: string | null; onApprove: (item: UnifiedItem) => void; nowDate: string }) {
  return (
    <div className={`flex items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${getRowBg(item, nowDate)}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium ${item.status === "approved" ? "line-through text-muted-foreground" : ""}`}>{item.title}</p>
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${TYPE_COLORS[item.type] || ""}`}>{item.type}</Badge>
        </div>
        {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {showStaff && <span>👤 {item.staffName}</span>}
          {item.dueDate && <span>⏰ Due: {item.dueDate}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.status === "in_progress" && (
          <Progress value={50} className="w-16 h-2" />
        )}
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
