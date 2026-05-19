import { useState, useEffect, useRef, useCallback } from "react";
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
}

// Task record retention is handled automatically server-side by the
// purge_old_task_logs() database function, scheduled daily via pg_cron.

export default function Tasks() {
  const { user } = useAuth();
  const { isAdmin, isStaff, loading: profileLoading } = useProfile();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalEvent[]>([]);
  const [eventAssignments, setEventAssignments] = useState<EventAssignment[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => { loadData(); }, 500);
  }, []);

  useEffect(() => {
    if (!user || profileLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileLoading, isAdmin, isStaff]);

  // Realtime subscription so Task Monitor refreshes automatically (debounced).
  // Scope filters to current user when staff to avoid global broadcast storms.
  useEffect(() => {
    if (!user || profileLoading) return;
    const channel = supabase.channel(`tasks-monitor-${user.id}`);

    if (isStaff) {
      const taskFilter = `assignee_id=eq.${user.id}`;
      const assignmentFilter = `user_id=eq.${user.id}`;
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks", filter: taskFilter }, scheduleRefetch)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: taskFilter }, scheduleRefetch)
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks", filter: taskFilter }, scheduleRefetch)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "calendar_event_assignments", filter: assignmentFilter }, scheduleRefetch)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calendar_event_assignments", filter: assignmentFilter }, scheduleRefetch);
      // Note: calendar_events changes will surface via their assignment rows for staff.
    } else {
      // Admin / assistant: needs visibility across all tasks/events.
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "tasks" }, scheduleRefetch)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, scheduleRefetch)
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "tasks" }, scheduleRefetch)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "calendar_event_assignments" }, scheduleRefetch)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calendar_event_assignments" }, scheduleRefetch)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "calendar_events" }, scheduleRefetch)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calendar_events" }, scheduleRefetch);
    }

    channel.subscribe();
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileLoading, isStaff]);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      // Profiles always needed for name lookups + staff list (admin view).
      const profilesPromise = supabase
        .from("profiles")
        .select("id, full_name, role, sequence")
        .order("sequence", { ascending: true })
        .order("full_name", { ascending: true });

      if (isStaff) {
        // Staff: fetch only their own tasks + their own event assignments.
        // Then fetch only the events referenced by those assignments.
        const [tasksRes, profilesRes, assRes] = await Promise.all([
          supabase
            .from("tasks")
            .select("*")
            .eq("assignee_id", user.id)
            .order("created_at", { ascending: false }),
          profilesPromise,
          supabase
            .from("calendar_event_assignments")
            .select("id, event_id, user_id, submission_status, submitted_at, approved_at, approved_by")
            .eq("user_id", user.id),
        ]);

        if (tasksRes.error) console.error("[Tasks] tasks fetch error:", tasksRes.error);
        if (profilesRes.error) console.error("[Tasks] profiles fetch error:", profilesRes.error);

        const names: Record<string, string> = {};
        if (profilesRes.data) {
          profilesRes.data.forEach((p: any) => { names[p.id] = p.full_name || "Unknown"; });
          setStaffNames(names);
          setStaffList(profilesRes.data.filter((p: any) => p.role === "staff"));
        }

        const assignments = (assRes.data as EventAssignment[]) || [];
        setEventAssignments(assignments);
        setTasks((tasksRes.data as TaskRow[]) || []);

        const eventIds = Array.from(new Set(assignments.map((a) => a.event_id))).filter(Boolean);
        if (eventIds.length > 0) {
          const evRes = await supabase
            .from("calendar_events")
            .select("*")
            .in("id", eventIds)
            .order("start_date", { ascending: false });
          setCalendarEvents((evRes.data as CalEvent[]) || []);
        } else {
          setCalendarEvents([]);
        }
      } else {
        // Admin / assistant: needs full visibility.
        const [tasksRes, profilesRes, evRes, assRes] = await Promise.all([
          supabase.from("tasks").select("*").order("created_at", { ascending: false }),
          profilesPromise,
          supabase.from("calendar_events").select("*").order("start_date", { ascending: false }),
          supabase.from("calendar_event_assignments").select("id, event_id, user_id, submission_status, submitted_at, approved_at, approved_by"),
        ]);

        if (tasksRes.error) console.error("[Tasks] tasks fetch error:", tasksRes.error);
        if (profilesRes.error) console.error("[Tasks] profiles fetch error:", profilesRes.error);

        const names: Record<string, string> = {};
        if (profilesRes.data) {
          const staff = profilesRes.data.filter((p: any) => p.role === "staff");
          setStaffList(staff);
          profilesRes.data.forEach((p: any) => { names[p.id] = p.full_name || "Unknown"; });
          setStaffNames(names);
        }

        setTasks((tasksRes.data as TaskRow[]) || []);
        setCalendarEvents((evRes.data as CalEvent[]) || []);
        setEventAssignments((assRes.data as EventAssignment[]) || []);
      }
    } catch (e) {
      console.error("[Tasks] loadData exception:", e);
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
      if (error) { toast.error("Failed to assign task"); return; }
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
      if (error) { toast.error("Failed to update task"); return; }
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
    return (
      <StaffTaskView
        tasks={tasks}
        togglingId={togglingId}
        onToggle={toggleTask}
        calendarEvents={calendarEvents}
        eventAssignments={eventAssignments}
        staffNames={staffNames}
      />
    );
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
