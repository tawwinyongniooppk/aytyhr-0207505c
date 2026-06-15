import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { sendPush } from "@/lib/push";
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
  // DB ကို တစ်ပြိုင်နက်တည်း အကြိမ်ကြိမ် Request မပို့မိအောင် ကာကွယ်မည့် Ref Guard
  const isFetchingRef = useRef(false);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      loadData();
    }, 500);
  }, []);

  useEffect(() => {
    if (!user || profileLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileLoading, isAdmin, isStaff]);

  // Refetch when the tab becomes visible again, instead of subscribing to
  // realtime channels (much lower DB load for a 20-user system).
  useEffect(() => {
    if (!user || profileLoading) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileLoading, isStaff]);


  async function loadData() {
    if (!user) return;
    // အကယ်၍ လက်ရှိမှာ Fetch လုပ်နေတုန်းဆိုရင် ထပ်မလုပ်ဘဲ ကျော်သွားမယ်
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);
    try {
      const profilesPromise = supabase
        .from("profiles")
        .select("id, full_name, role, sequence")
        .order("sequence", { ascending: true })
        .order("full_name", { ascending: true });

      if (isStaff) {
        const monthStart = (() => {
          const d = new Date();
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
        })();
        const [tasksRes, profilesRes, ownAssRes, publicEvRes] = await Promise.all([
          supabase.from("tasks").select("*").eq("assignee_id", user.id).order("created_at", { ascending: false }),
          profilesPromise,
          supabase
            .from("calendar_event_assignments")
            .select("id, event_id, user_id, submission_status, submitted_at, approved_at, approved_by")
            .eq("user_id", user.id),
          // Team-visible task events for the current month onward — for the
          // separate "Team Tasks" card. Staff can see these per the updated
          // RLS policy on calendar_event_assignments.
          supabase
            .from("calendar_events")
            .select("*")
            .eq("event_type", "task")
            .eq("visibility", "public")
            .gte("start_date", monthStart)
            .order("start_date", { ascending: false }),
        ]);

        if (tasksRes.error) console.error("[Tasks] tasks fetch error:", tasksRes.error);
        if (profilesRes.error) console.error("[Tasks] profiles fetch error:", profilesRes.error);

        const names: Record<string, string> = {};
        if (profilesRes.data) {
          profilesRes.data.forEach((p: any) => {
            names[p.id] = p.full_name || "Unknown";
          });
          setStaffNames(names);
          setStaffList(profilesRes.data.filter((p: any) => p.role === "staff"));
        }

        const ownAssignments = (ownAssRes.data as EventAssignment[]) || [];
        setTasks((tasksRes.data as TaskRow[]) || []);

        const publicEvents = (publicEvRes.data as CalEvent[]) || [];
        const ownEventIds = new Set(ownAssignments.map((a) => a.event_id));
        const extraEventIds = publicEvents
          .map((e) => e.id)
          .filter((id) => !ownEventIds.has(id));

        // Pull all assignments for team-visible events so we can show who is
        // working on them (read-only) in the Team Tasks card.
        let teamAssignments: EventAssignment[] = [];
        if (publicEvents.length > 0) {
          const { data: teamAss } = await supabase
            .from("calendar_event_assignments")
            .select("id, event_id, user_id, submission_status, submitted_at, approved_at, approved_by")
            .in("event_id", publicEvents.map((e) => e.id));
          teamAssignments = (teamAss as EventAssignment[]) || [];
        }

        // Merge: own + team assignments (dedupe by id), so myCalendarTasks still works.
        const mergedAss = new Map<string, EventAssignment>();
        [...ownAssignments, ...teamAssignments].forEach((a) => mergedAss.set(a.id, a));
        setEventAssignments(Array.from(mergedAss.values()));

        // Fetch own event details (older than this month may not appear in public window)
        const ownOnlyMissing = Array.from(ownEventIds).filter(
          (id) => !publicEvents.some((e) => e.id === id),
        );
        let ownEvents: CalEvent[] = [];
        if (ownOnlyMissing.length > 0) {
          const { data: evRes } = await supabase
            .from("calendar_events")
            .select("*")
            .in("id", ownOnlyMissing);
          ownEvents = (evRes as CalEvent[]) || [];
        }
        setCalendarEvents([...publicEvents, ...ownEvents]);
        void extraEventIds;

      } else {
        // Admin View — current month onward (plus any still-active items whose
        // end_date is in the current/future month). No hard row caps, so newly
        // assigned tasks and recently completed units always appear.
        const monthStart = (() => {
          const d = new Date();
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
        })();

        const [tasksRes, profilesRes, evRes] = await Promise.all([
          // Tasks: include anything created this month OR still due this month/later
          supabase
            .from("tasks")
            .select("*")
            .or(`created_at.gte.${monthStart},due_date.gte.${monthStart}`)
            .order("created_at", { ascending: false }),
          profilesPromise,
          // Calendar events: anything that is active in (or after) the current month
          supabase
            .from("calendar_events")
            .select("*")
            .gte("end_date", monthStart)
            .order("start_date", { ascending: false }),
        ]);

        if (tasksRes.error) console.error("[Tasks] tasks fetch error:", tasksRes.error);
        if (profilesRes.error) console.error("[Tasks] profiles fetch error:", profilesRes.error);
        if (evRes.error) console.error("[Tasks] events fetch error:", evRes.error);

        const names: Record<string, string> = {};
        if (profilesRes.data) {
          const staff = profilesRes.data.filter((p: any) => p.role === "staff");
          setStaffList(staff);
          profilesRes.data.forEach((p: any) => {
            names[p.id] = p.full_name || "Unknown";
          });
          setStaffNames(names);
        }

        const events = (evRes.data as CalEvent[]) || [];

        // Assignments scoped to the fetched events — guarantees every visible
        // event has its full assignment set (no row-limit truncation).
        let assignments: EventAssignment[] = [];
        if (events.length > 0) {
          const { data: assRows, error: assErr } = await supabase
            .from("calendar_event_assignments")
            .select("id, event_id, user_id, submission_status, submitted_at, approved_at, approved_by")
            .in("event_id", events.map((e) => e.id));
          if (assErr) console.error("[Tasks] assignments fetch error:", assErr);
          assignments = (assRows as EventAssignment[]) || [];
        }

        setTasks((tasksRes.data as TaskRow[]) || []);
        setCalendarEvents(events);
        setEventAssignments(assignments);
      }
    } catch (e) {
      console.error("[Tasks] loadData exception:", e);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
      isFetchingRef.current = false; // Fetching ပြီးဆုံးကြောင်း ပြန်ဖွင့်ပေးပါတယ်
    }
  }

  async function handleAssignTask(form: {
    title: string;
    description: string;
    assignee_id: string;
    due_date?: string;
  }) {
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
        if ((error.message || "").includes("DUPLICATE_TASK")) {
          toast.error("ဤ Staff အတွက် တူညီသော ရက်စွဲတွင် Task တစ်ခု Assign ပြီးသား ရှိနေပါသည်");
        } else {
          toast.error("Failed to assign task");
        }
        return;
      }
      toast.success("Task assigned successfully");
      sendPush({
        user_ids: [form.assignee_id],
        title: "New task assigned",
        body: form.title,
        url: "/tasks",
      });
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
    return (
      <StaffTaskView
        tasks={tasks}
        togglingId={togglingId}
        onToggle={toggleTask}
        calendarEvents={calendarEvents}
        eventAssignments={eventAssignments}
        staffNames={staffNames}
        staffList={staffList}
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
