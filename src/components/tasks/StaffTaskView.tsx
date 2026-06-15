import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ClipboardList, Send, CheckCircle2, Clock, AlertTriangle, ThumbsUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { notifyAdmins } from "@/lib/push";
import { getMMTTodayISO } from "@/lib/mmt";
import { toast } from "sonner";
import { StatusMonitor } from "./StatusMonitor";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  assigned_by?: string;
  completed: boolean;
  created_at: string;
  due_date?: string | null;
  submission_status: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
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
  assigned_to_all?: boolean;
}

interface EventAssignment {
  id: string;
  event_id: string;
  user_id: string;
  submission_status: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason?: string | null;
}

interface StaffTaskViewProps {
  tasks: TaskRow[];
  togglingId: string | null;
  onToggle: (id: string, current: boolean) => void;
  calendarEvents?: CalEvent[];
  eventAssignments?: EventAssignment[];
  staffNames?: Record<string, string>;
  staffList?: Array<{ id: string; full_name: string; sequence?: number | null }>;
}

const nowDate = () => getMMTTodayISO();

function sortByDeadline<T extends { dueDate?: string | null; status: string }>(items: T[]): T[] {
  const statusOrder: Record<string, number> = { overdue: 0, rejected: 1, not_started: 2, in_progress: 3, submitted: 4, approved: 5 };
  return [...items].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 1;
    const sb = statusOrder[b.status] ?? 1;
    if (sa !== sb) return sa - sb;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });
}

export function StaffTaskView({ tasks, calendarEvents = [], eventAssignments = [], staffNames = {}, staffList = [] }: StaffTaskViewProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const staffName = profile?.full_name || "Staff";
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState(tasks);
  const [localAssignments, setLocalAssignments] = useState<EventAssignment[]>(eventAssignments);
  const [hasNewTasks, setHasNewTasks] = useState(false);

  useEffect(() => { setLocalTasks(tasks); }, [tasks]);
  useEffect(() => { setLocalAssignments(eventAssignments); }, [eventAssignments]);

  // Calendar tasks visible to this staff = task-type events where the user has an assignment
  const myCalendarTasks = useMemo(() => {
    if (!user) return [] as Array<{ event: CalEvent; assignment: EventAssignment }>;
    return calendarEvents
      .filter((ev) => ev.event_type === "task")
      .map((ev) => {
        const assignment = localAssignments.find((a) => a.event_id === ev.id && a.user_id === user.id);
        return assignment ? { event: ev, assignment } : null;
      })
      .filter(Boolean) as Array<{ event: CalEvent; assignment: EventAssignment }>;
  }, [calendarEvents, localAssignments, user]);

  // Team-visible tasks assigned to OTHER staff — separate, read-only card.
  // Only public-visibility task events where the current user is NOT assigned.
  const teamTasks = useMemo(() => {
    if (!user) return [] as Array<{ event: CalEvent; assignments: EventAssignment[] }>;
    return calendarEvents
      .filter((ev) => ev.event_type === "task" && ev.visibility === "public" && !ev.assigned_to_all)
      .map((ev) => {
        const ass = localAssignments.filter((a) => a.event_id === ev.id && a.user_id !== user.id);
        return ass.length > 0 ? { event: ev, assignments: ass } : null;
      })
      .filter(Boolean) as Array<{ event: CalEvent; assignments: EventAssignment[] }>;
  }, [calendarEvents, localAssignments, user]);


  useEffect(() => {
    const newOnes = localTasks.filter(t => t.submission_status === "not_started" || t.submission_status === "not_submitted");
    const newAssignments = myCalendarTasks.filter(({ assignment }) => assignment.submission_status === "not_started" || assignment.submission_status === "not_submitted");
    if (newOnes.length > 0 || newAssignments.length > 0) setHasNewTasks(true);
  }, [localTasks, myCalendarTasks]);

  async function handleAcknowledgeTask(taskId: string) {
    setAcknowledgingId(taskId);
    try {
      const { error } = await supabase.from("tasks").update({ submission_status: "in_progress" }).eq("id", taskId);
      if (error) throw error;
      toast.success("Task acknowledged — marked as In Progress");
      setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, submission_status: "in_progress" } : t));
    } catch { toast.error("Failed to acknowledge task"); }
    finally { setAcknowledgingId(null); }
  }

  async function handleAcknowledgeAssignment(assignmentId: string) {
    setAcknowledgingId(assignmentId);
    try {
      const { error } = await supabase.from("calendar_event_assignments").update({ submission_status: "in_progress" }).eq("id", assignmentId);
      if (error) throw error;
      toast.success("Task acknowledged — marked as In Progress");
      setLocalAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, submission_status: "in_progress" } : a));
    } catch { toast.error("Failed to acknowledge"); }
    finally { setAcknowledgingId(null); }
  }

  async function handleSubmitTask(taskId: string) {
    setSubmittingTaskId(taskId);
    try {
      const { error } = await supabase.from("tasks").update({ submission_status: "submitted", submitted_at: new Date().toISOString(), completed: true, rejection_reason: null, rejected_at: null, rejected_by: null }).eq("id", taskId);
      if (error) throw error;
      toast.success("Task submitted successfully");
      setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, submission_status: "submitted", completed: true, rejection_reason: null } : t));
      const t = localTasks.find(x => x.id === taskId);
      notifyAdmins("Task submitted for review", `${staffName} submitted: ${t?.title ?? "a task"}`, "/tasks");
    } catch { toast.error("Failed to submit task"); }
    finally { setSubmittingTaskId(null); }
  }

  async function handleSubmitAssignment(assignmentId: string) {
    setSubmittingId(assignmentId);
    try {
      const { error } = await supabase.from("calendar_event_assignments").update({ submission_status: "submitted", submitted_at: new Date().toISOString(), rejection_reason: null, rejected_at: null, rejected_by: null }).eq("id", assignmentId);
      if (error) throw error;
      toast.success("Submitted successfully");
      setLocalAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, submission_status: "submitted", rejection_reason: null } : a));
      notifyAdmins("Task submitted for review", `${staffName} submitted a task`, "/tasks");
    } catch { toast.error("Failed to submit"); }
    finally { setSubmittingId(null); }
  }


  // "Fix & Resubmit" goes directly from Rejected → Submitted per spec.
  async function handleResubmitTask(taskId: string) {
    setSubmittingTaskId(taskId);
    try {
      const { error } = await supabase.from("tasks").update({ submission_status: "submitted", submitted_at: new Date().toISOString(), completed: true, rejection_reason: null, rejected_at: null, rejected_by: null }).eq("id", taskId);
      if (error) throw error;
      toast.success("Resubmitted for review");
      setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, submission_status: "submitted", completed: true, rejection_reason: null } : t));
      const t = localTasks.find(x => x.id === taskId);
      notifyAdmins("Task resubmitted", `${staffName} resubmitted: ${t?.title ?? "a task"}`, "/tasks");
    } catch { toast.error("Failed to resubmit task"); }
    finally { setSubmittingTaskId(null); }
  }

  async function handleResubmitAssignment(assignmentId: string) {
    setSubmittingId(assignmentId);
    try {
      const { error } = await supabase.from("calendar_event_assignments").update({ submission_status: "submitted", submitted_at: new Date().toISOString(), rejection_reason: null, rejected_at: null, rejected_by: null }).eq("id", assignmentId);
      if (error) throw error;
      toast.success("Resubmitted for review");
      setLocalAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, submission_status: "submitted", rejection_reason: null } : a));
      notifyAdmins("Task resubmitted", `${staffName} resubmitted a task`, "/tasks");
    } catch { toast.error("Failed to resubmit"); }
    finally { setSubmittingId(null); }
  }

  const now = nowDate();

  const normalizedTasks = localTasks.map(t => ({
    ...t,
    dueDate: t.due_date,
    status: t.submission_status === "approved" ? "approved"
      : t.submission_status === "rejected" ? "rejected"
      : t.submission_status === "submitted" ? "submitted"
      : t.submission_status === "in_progress" ? "in_progress"
      : (t.due_date && t.due_date < now) ? "overdue" : "not_started",
  }));
  const sortedTasks = sortByDeadline(normalizedTasks);

  const normalizedCalTasks = myCalendarTasks.map(({ event, assignment }) => ({
    id: assignment.id,
    eventId: event.id,
    title: event.title,
    description: event.description,
    dueDate: event.end_date,
    startDate: event.start_date,
    assignedBy: event.created_by,
    assignedToAll: !!event.assigned_to_all,
    submission_status: assignment.submission_status,
    rejection_reason: (assignment as any).rejection_reason || null,
    status: assignment.submission_status === "approved" ? "approved"
      : assignment.submission_status === "rejected" ? "rejected"
      : assignment.submission_status === "submitted" ? "submitted"
      : assignment.submission_status === "in_progress" ? "in_progress"
      : (event.end_date && event.end_date < now) ? "overdue" : "not_started",
  }));
  const sortedCalTasks = sortByDeadline(normalizedCalTasks);

  const rawPending = sortedTasks.filter(t => ["not_started","overdue","in_progress"].includes(t.status)).length
    + sortedCalTasks.filter(t => ["not_started","overdue","in_progress"].includes(t.status)).length;
  const rawSubmitted = sortedTasks.filter(t => t.status === "submitted").length + sortedCalTasks.filter(t => t.status === "submitted").length;
  const rawApproved = sortedTasks.filter(t => t.status === "approved").length + sortedCalTasks.filter(t => t.status === "approved").length;
  // Monthly quota is 4 units per staff — badges never display more than 4.
  const allPending = Math.min(rawPending, 4);
  const submittedCount = Math.min(rawSubmitted, 4);
  const approvedCount = Math.min(rawApproved, 4);

  function getStatusBadge(status: string) {
    if (status === "approved") return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs shrink-0"><AlertTriangle className="h-3 w-3 mr-1" />Rejected</Badge>;
    if (status === "submitted") return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs shrink-0"><Clock className="h-3 w-3 mr-1" />Submitted</Badge>;
    if (status === "in_progress") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs shrink-0"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    if (status === "overdue") return <Badge className="bg-destructive text-destructive-foreground text-xs shrink-0"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    return <Badge className="bg-muted text-muted-foreground text-xs shrink-0">Not Started</Badge>;
  }

  function getRowBg(status: string, dueDate?: string | null) {
    if (status === "approved") return "bg-blue-50 dark:bg-blue-950/20";
    if (status === "rejected") return "bg-red-50 dark:bg-red-950/20 border-l-2 border-l-red-500";
    if (status === "submitted") return "bg-orange-50 dark:bg-orange-950/20";
    if (status === "in_progress") return "bg-green-50 dark:bg-green-950/20 border-l-2 border-l-green-500";
    if (status === "overdue") return "bg-destructive/10 border-l-2 border-l-destructive";
    if (dueDate) {
      const diff = Math.ceil((new Date(dueDate).getTime() - new Date(now).getTime()) / 86400000);
      if (diff <= 2) return "bg-destructive/10 border-l-2 border-l-destructive";
    }
    return "bg-muted/30 border-l-2 border-l-muted-foreground/30";
  }

  return (
    <div className="space-y-6">
      {hasNewTasks && (localTasks.some(t => t.submission_status === "not_started" || t.submission_status === "not_submitted") || myCalendarTasks.some(({ assignment }) => assignment.submission_status === "not_started")) && (
        <Card className="border-2 border-primary shadow-sm bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <ThumbsUp className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm font-medium">You have new tasks assigned. Please acknowledge them to start working.</p>
          </CardContent>
        </Card>
      )}

      <div>
        <h1 className="text-2xl font-bold font-display">My Tasks</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">{allPending} pending</Badge>
          {submittedCount > 0 && <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs">{submittedCount} submitted</Badge>}
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">{approvedCount} approved</Badge>
        </div>
      </div>

      <Card className="border border-border shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">📝 Assigned Tasks</h3>
          {sortedTasks.length === 0 && sortedCalTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No tasks assigned yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sortedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex flex-col sm:flex-row sm:items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${getRowBg(task.status, task.due_date)}`}
                >
                  <div className="flex-1 min-w-0 w-full">
                    <p className={`text-sm font-medium flex items-start gap-2 break-words ${task.status === "approved" ? "line-through text-muted-foreground" : ""}`}>
                      {(task.submission_status === "not_started" || task.submission_status === "not_submitted") && (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-destructive/20 animate-pulse shrink-0" title="Not yet accepted" />
                      )}
                      <span className="min-w-0 break-words">{task.title}</span>
                    </p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{task.description}</p>
                    )}
                    {task.status === "rejected" && (task as any).rejection_reason && (
                      <p className="text-xs mt-1 text-red-700 dark:text-red-400 break-words"><span className="font-semibold">Rejected:</span> {(task as any).rejection_reason}</p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {task.due_date && <span>⏰ Due: {task.due_date}</span>}
                      {task.assigned_by && <span>👤 Assigned by: {staffNames[task.assigned_by] || "Admin"}</span>}
                      <span>🎯 Assigned to: You</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0 flex-wrap w-full sm:w-auto sm:justify-end">
                    {task.status === "in_progress" && <Progress value={50} className="w-16 h-2" />}
                    {getStatusBadge(task.status)}
                    {(task.submission_status === "not_started" || task.submission_status === "not_submitted") && (
                      <Button size="sm" className="text-xs gap-1" disabled={acknowledgingId === task.id} onClick={() => handleAcknowledgeTask(task.id)}>
                        {acknowledgingId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                        I understand, I will do it
                      </Button>
                    )}
                    {task.submission_status === "in_progress" && (
                      <Button size="sm" variant="outline" className="text-xs gap-1" disabled={submittingTaskId === task.id} onClick={() => handleSubmitTask(task.id)}>
                        {submittingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Submit
                      </Button>
                    )}
                    {task.submission_status === "rejected" && (
                      <Button size="sm" className="text-xs gap-1" disabled={submittingTaskId === task.id} onClick={() => handleResubmitTask(task.id)}>
                        {submittingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Fix & Resubmit
                      </Button>
                    )}
                  </div>
                </div>
              ))}


              {sortedCalTasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex flex-col sm:flex-row sm:items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${getRowBg(task.status, task.dueDate)}`}
                >
                  <div className="flex-1 min-w-0 w-full">
                    <p className={`text-sm font-medium flex items-start gap-2 break-words ${task.status === "approved" ? "line-through text-muted-foreground" : ""}`}>
                      {(task.submission_status === "not_started" || task.submission_status === "not_submitted") && (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-destructive/20 animate-pulse shrink-0" title="Not yet accepted" />
                      )}
                      <span className="min-w-0 break-words">{task.title}</span>
                    </p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{task.description}</p>
                    )}
                    {task.status === "rejected" && task.rejection_reason && (
                      <p className="text-xs mt-1 text-red-700 dark:text-red-400 break-words"><span className="font-semibold">Rejected:</span> {task.rejection_reason}</p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {task.startDate && <span>📅 Start: {task.startDate}</span>}
                      {task.dueDate && <span>⏰ Deadline: {task.dueDate}</span>}
                      <span>👤 Assigned by: {staffNames[task.assignedBy] || "Admin"}</span>
                      <span>🎯 Assigned to: {task.assignedToAll ? "All Staff" : "You"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0 flex-wrap w-full sm:w-auto sm:justify-end">
                    {task.status === "in_progress" && <Progress value={50} className="w-16 h-2" />}
                    {getStatusBadge(task.status)}
                    {(task.submission_status === "not_started" || task.submission_status === "not_submitted") && (
                      <Button size="sm" className="text-xs gap-1" disabled={acknowledgingId === task.id} onClick={() => handleAcknowledgeAssignment(task.id)}>
                        {acknowledgingId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                        I understand, I will do it
                      </Button>
                    )}
                    {task.submission_status === "in_progress" && (
                      <Button size="sm" variant="outline" className="text-xs gap-1" disabled={submittingId === task.id} onClick={() => handleSubmitAssignment(task.id)}>
                        {submittingId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Submit
                      </Button>
                    )}
                    {task.submission_status === "rejected" && (
                      <Button size="sm" className="text-xs gap-1" disabled={submittingId === task.id} onClick={() => handleResubmitAssignment(task.id)}>
                        {submittingId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Fix & Resubmit
                      </Button>
                    )}
                  </div>
                </div>
              ))}

            </div>
          )}
        </CardContent>
      </Card>

      <StatusMonitor staffList={staffList} />
    </div>
  );
}
