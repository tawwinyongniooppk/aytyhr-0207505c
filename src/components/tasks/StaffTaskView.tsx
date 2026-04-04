import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ClipboardList, Send, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
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

export function StaffTaskView({ tasks, togglingId, onToggle }: StaffTaskViewProps) {
  const { user } = useAuth();
  const [calAssignments, setCalAssignments] = useState<CalEventAssignment[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [localTasks, setLocalTasks] = useState(tasks);

  useEffect(() => { setLocalTasks(tasks); }, [tasks]);

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

  const pendingTasks = localTasks.filter(t => t.submission_status !== "approved" && !t.completed).length;
  const submittedTasks = localTasks.filter(t => t.submission_status === "submitted").length;
  const approvedTasks = localTasks.filter(t => t.submission_status === "approved").length;

  const pendingAssignments = calAssignments.filter(a => a.submission_status === "not_submitted").length;

  function getStatusBadge(status: string, dueDate?: string | null) {
    const now = new Date().toISOString().split("T")[0];
    if (status === "approved") return <Badge className="bg-accent/10 text-accent text-xs shrink-0"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    if (status === "submitted") return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs shrink-0"><Clock className="h-3 w-3 mr-1" />Submitted</Badge>;
    if (dueDate && dueDate < now) return <Badge className="bg-destructive text-destructive-foreground text-xs shrink-0"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    return <Badge className="bg-destructive/10 text-destructive text-xs shrink-0">Pending</Badge>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">My Tasks</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">{pendingTasks + pendingAssignments} pending</Badge>
          {submittedTasks > 0 && <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs">{submittedTasks} submitted</Badge>}
          <Badge variant="secondary" className="bg-accent/10 text-accent text-xs">{approvedTasks} approved</Badge>
        </div>
      </div>

      {/* Tasks */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">📝 Assigned Tasks</h3>
          {localTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No tasks assigned yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {localTasks.map((task) => {
                const status = task.submission_status || "not_submitted";
                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${
                      status === "approved" ? "bg-accent/5" : status === "submitted" ? "bg-orange-50 dark:bg-orange-950/20" : "bg-destructive/5 border-l-2 border-l-destructive"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${status === "approved" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
                      {task.due_date && <p className="text-xs text-muted-foreground mt-1">📅 Due: {task.due_date}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(status, task.due_date)}
                      {status === "not_submitted" && (
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calendar Assignments */}
      {calAssignments.length > 0 && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">📅 Calendar Assignments</h3>
            <div className="space-y-1">
              {calAssignments.map((a) => {
                const ev = a.calendar_events;
                return (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${
                      a.submission_status === "approved" ? "bg-accent/5" : a.submission_status === "submitted" ? "bg-orange-50 dark:bg-orange-950/20" : "bg-destructive/5 border-l-2 border-l-destructive"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-medium ${a.submission_status === "approved" ? "line-through text-muted-foreground" : ""}`}>{ev.title}</p>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{ev.event_type}</Badge>
                      </div>
                      {ev.description && <p className="text-xs text-muted-foreground mt-1">{ev.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">📅 {ev.start_date}{ev.start_date !== ev.end_date ? ` → ${ev.end_date}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(a.submission_status)}
                      {a.submission_status === "not_submitted" && (
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
