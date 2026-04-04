import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { StaffTaskView } from "@/components/tasks/StaffTaskView";
import { AdminTaskDashboard } from "@/components/tasks/AdminTaskDashboard";

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

interface StaffMember {
  id: string;
  full_name: string;
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
  id: string;
  event_id: string;
  user_id: string;
  submission_status: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
}

export default function Tasks() {
  const { user } = useAuth();
  const { isAdmin, isStaff } = useProfile();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalEvent[]>([]);
  const [eventAssignments, setEventAssignments] = useState<EventAssignment[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const tasksQuery = supabase.from("tasks").select("*").order("created_at", { ascending: false });
      const profilesQuery = supabase.from("profiles").select("id, full_name, role");

      const [tasksRes, profilesRes] = await Promise.all([tasksQuery, profilesQuery]);

      let eventsData: CalEvent[] = [];
      let assignmentsData: EventAssignment[] = [];

      if (isAdmin) {
        const [evRes, assRes] = await Promise.all([
          supabase.from("calendar_events").select("*").order("start_date", { ascending: false }),
          supabase.from("calendar_event_assignments").select("id, event_id, user_id, submission_status, submitted_at, approved_at, approved_by"),
        ]);
        if (evRes.data) eventsData = evRes.data as CalEvent[];
        if (assRes.data) assignmentsData = assRes.data as EventAssignment[];
      }

      if (profilesRes.data) {
        const staff = profilesRes.data.filter((p: any) => p.role === "staff");
        setStaffList(staff);
        const names: Record<string, string> = {};
        profilesRes.data.forEach((p: any) => {
          names[p.id] = p.full_name || "Unknown";
        });
        setStaffNames(names);
      }

      if (tasksRes.data) {
        let filtered = tasksRes.data as TaskRow[];
        if (isStaff && user) {
          filtered = filtered.filter((t) => t.assignee_id === user.id);
        }
        setTasks(filtered);
      }

      setCalendarEvents(eventsData);
      setEventAssignments(assignmentsData);
    } catch {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignTask(form: { title: string; description: string; assignee_id: string; due_date?: string }) {
    if (!form.title || !form.assignee_id || !user) return;
    setSubmitting(true);
    try {
      const insertData: any = {
        title: form.title,
        description: form.description,
        assignee_id: form.assignee_id,
        assigned_by: user.id,
      };
      if (form.due_date) insertData.due_date = form.due_date;
      
      const { error } = await supabase.from("tasks").insert(insertData);
      if (error) {
        toast.error("Failed to assign task");
        return;
      }
      toast.success("Task assigned successfully");
      loadData();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTask(id: string, currentValue: boolean) {
    setTogglingId(id);
    try {
      const { error } = await supabase.from("tasks").update({ completed: !currentValue }).eq("id", id);
      if (error) {
        toast.error("Failed to update task");
        return;
      }
      const newStatus = !currentValue;
      toast.success(newStatus ? "Task marked as completed" : "Task marked as pending");
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: newStatus } : t)));
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading tasks...</p>
      </div>
    );
  }

  if (isStaff) {
    return <StaffTaskView tasks={tasks} togglingId={togglingId} onToggle={toggleTask} />;
  }

  return (
    <AdminTaskDashboard
      tasks={tasks}
      calendarEvents={calendarEvents}
      eventAssignments={eventAssignments}
      staffList={staffList}
      staffNames={staffNames}
      onAssignTask={handleAssignTask}
      submitting={submitting}
      onRefresh={loadData}
    />
  );
}
