import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ClipboardList, Send, CheckCircle2, Clock, AlertTriangle, ThumbsUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  completed: boolean;
  created_at: string;
  due_date?: string | null;
  submission_status: string;
  submitted_at?: string | null;
  approved_at?: string | null;
}

interface CalEventAssignment {
  id: string;
  event_id: string;
  user_id: string;
  submission_status: string;
  submitted_at: string | null;
  approved_at: string | null;
  calendar_events: {
    title: string;
    description: string;
    start_date: string;
    end_date: string;
    event_type: string;
  };
}

interface StaffTaskViewProps {
  tasks: TaskRow[];
  togglingId: string | null;
  onToggle: (id: string, current: boolean) => void;
}

const nowDate = () => new Date().toISOString().split("T")[0];

function sortByDeadline<T extends { dueDate?: string | null; status: string }>(items: T[]): T[] {
  const statusOrder: Record<string, number> = { overdue: 0, not_started: 1, in_progress: 2, submitted: 3, approved: 4 };
  return [...items].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 1;
    const sb = statusOrder[b.status] ?? 1;
    if (sa !== sb) return sa - sb;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });
}

export function StaffTaskView({ tasks }: StaffTaskViewProps) {
  const { user } = useAuth();
  const [calAssignments, setCalAssignments] = useState<CalEventAssignment[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState(tasks);
  const [hasNewTasks, setHasNewTasks] = useState(false);

  useEffect(() => { setLocalTasks(tasks); }, [tasks]);

  useEffect(() => {
    // Check for new unacknowledged tasks
    const newOnes = localTasks.filter(t => t.submission_status === "not_started" || t.submission_status === "not_submitted");
    const newAssignments = calAssignments.filter(a => a.submission_status === "not_started" || a.submission_status === "not_submitted");
    if (newOnes.length > 0 || newAssignments.length > 0) {
      setHasNewTasks(true);
    }
  }, [localTasks, calAssignments]);

  useEffect(() => {
    if (!user) return;
    loadCalendarAssignments();
  }, [user]);

  async function loadCalendarAssignments() {
    const { data } = await supabase
      .from("calendar_event_assignments")
      .select("id, event_id, user_id, submission_status, submitted_at, approved_at, calendar_events(title, description, start_date, end_date, event_type)")
      .eq("user_id", user!.id) as any;
    if (data) setCalAssignments(data);
  }

  async function handleAcknowledgeTask(taskId: string) {
    setAcknowledgingId(taskId);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ submission_status: "in_progress" })
        .eq("id", taskId);
      if (error) throw error;
      toast.success("Task acknowledged — marked as In Progress");
      setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, submission_status: "in_progress" } : t));
    } catch {
      toast.error("Failed to acknowledge task");
    } finally {
      setAcknowledgingId(null);
    }
  }

  async function handleAcknowledgeAssignment(assignmentId: string) {
    setAcknowledgingId(assignmentId);
    try {
      const { error } = await supabase
        .from("calendar_event_assignments")
        .update({ submission_status: "in_progress" })
        .eq("id", assignmentId);
      if (error) throw error;
      toast.success("Task acknowledged — marked as In Progress");
      setCalAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, submission_status: "in_progress" } : a));
    } catch {
      toast.error("Failed to acknowledge");
    } finally {
      setAcknowledgingId(null);
    }
  }

  async function handleSubmitTask(taskId: string) {
    setSubmittingTaskId(taskId);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ submission_status: "submitted", submitted_at: new Date().toISOString(), completed: true })
        .eq("id", taskId);
      if (error) throw error;
      toast.success("Task submitted successfully");
      setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, submission_status: "submitted", completed: true } : t));
    } catch {
      toast.error("Failed to submit task");
    } finally {
      setSubmittingTaskId(null);
    }
  }

  async function handleSubmitAssignment(assignmentId: string) {
    setSubmittingId(assignmentId);
    try {
      const { error } = await supabase
        .from("calendar_event_assignments")
        .update({ submission_status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", assignmentId);
      if (error) throw error;
      toast.success("Submitted successfully");
      setCalAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, submission_status: "submitted" } : a));
    } catch {
      toast.error("Failed to submit");
    } finally {
      setSubmittingId(null);
    }
  }

  const now = nowDate();

  // Normalize tasks for sorting
  const normalizedTasks = localTasks.map(t => ({
    ...t,
    dueDate: t.due_date,
    status: t.submission_status === "approved" ? "approved"
      : t.submission_status === "submitted" ? "submitted"
      : t.submission_status === "in_progress" ? "in_progress"
      : (t.due_date && t.due_date < now) ? "overdue"
      : "not_started",
  }));
  const sortedTasks = sortByDeadline(normalizedTasks);

  const normalizedAssignments = calAssignments.map(a => ({
    ...a,
    dueDate: a.calendar_events?.end_date,
    status: a.submission_status === "approved" ? "approved"
      : a.submission_status === "submitted" ? "submitted"
      : a.submission_status === "in_progress" ? "in_progress"
      : (a.calendar_events?.end_date && a.calendar_events.end_date < now) ? "overdue"
      : "not_started",
  }));
  const sortedAssignments = sortByDeadline(normalizedAssignments);

  const pendingTasks = sortedTasks.filter(t => t.status === "not_started" || t.status === "overdue" || t.status === "in_progress").length;
  const submittedTasks = sortedTasks.filter(t => t.status === "submitted").length;
  const approvedTasks = sortedTasks.filter(t => t.status === "approved").length;
  const pendingAssignments = sortedAssignments.filter(a => a.status === "not_started" || a.status === "overdue" || a.status === "in_progress").length;

  function getStatusBadge(status: string) {
    if (status === "approved") return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    if (status === "submitted") return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs shrink-0"><Clock className="h-3 w-3 mr-1" />Submitted</Badge>;
    if (status === "in_progress") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs shrink-0"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
    if (status === "overdue") return <Badge className="bg-destructive text-destructive-foreground text-xs shrink-0"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    return <Badge className="bg-muted text-muted-foreground text-xs shrink-0">Not Started</Badge>;
  }

  function getRowBg(status: string, dueDate?: string | null) {
    if (status === "approved") return "bg-blue-50 dark:bg-blue-950/20";
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
      {/* Notification banner */}
      {hasNewTasks && localTasks.some(t => t.submission_status === "not_started" || t.submission_status === "not_submitted") && (
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
          <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">{pendingTasks + pendingAssignments} pending</Badge>
          {submittedTasks > 0 && <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs">{submittedTasks} submitted</Badge>}
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">{approvedTasks} approved</Badge>
        </div>
      </div>

      {/* Tasks */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">📝 Assigned Tasks</h3>
          {sortedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No tasks assigned yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sortedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${getRowBg(task.status, task.due_date)}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === "approved" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                    {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
                    {task.due_date && <p className="text-xs text-muted-foreground mt-1">⏰ Due: {task.due_date}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.status === "in_progress" && <Progress value={50} className="w-16 h-2" />}
                    {getStatusBadge(task.status)}
                    {task.submission_status === "not_submitted" && (
                      <Button
                        size="sm"
                        className="text-xs gap-1"
                        disabled={acknowledgingId === task.id}
                        onClick={() => handleAcknowledgeTask(task.id)}
                      >
                        {acknowledgingId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                        I understand
                      </Button>
                    )}
                    {task.submission_status === "in_progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1"
                        disabled={submittingTaskId === task.id}
                        onClick={() => handleSubmitTask(task.id)}
                      >
                        {submittingTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Submit
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calendar Assignments */}
      {sortedAssignments.length > 0 && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">📅 Calendar Assignments</h3>
            <div className="space-y-1">
              {sortedAssignments.map((a) => {
                const ev = a.calendar_events;
                return (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${getRowBg(a.status, ev?.end_date)}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${a.status === "approved" ? "line-through text-muted-foreground" : ""}`}>{ev?.title}</p>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{ev?.event_type}</Badge>
                      </div>
                      {ev?.description && <p className="text-xs text-muted-foreground mt-1">{ev.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">⏰ {ev?.start_date}{ev?.start_date !== ev?.end_date ? ` → ${ev?.end_date}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.status === "in_progress" && <Progress value={50} className="w-16 h-2" />}
                      {getStatusBadge(a.status)}
                      {a.submission_status === "not_submitted" && (
                        <Button
                          size="sm"
                          className="text-xs gap-1"
                          disabled={acknowledgingId === a.id}
                          onClick={() => handleAcknowledgeAssignment(a.id)}
                        >
                          {acknowledgingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                          I understand
                        </Button>
                      )}
                      {a.submission_status === "in_progress" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          disabled={submittingId === a.id}
                          onClick={() => handleSubmitAssignment(a.id)}
                        >
                          {submittingId === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Submit
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
