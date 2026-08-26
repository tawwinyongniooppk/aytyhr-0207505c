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
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
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
      const profilesPromise = (supabase.rpc("list_staff_directory") as any).then((r: any) => ({
        data: (r.data as any[] | null) ?? [],
        error: r.error,
      }));

      if (isStaff) {
        const [tasksRes, profilesRes, assRes] = await Promise.all([
          supabase.from("tasks").select("*").eq("assignee_id", user.id).order("created_at", { ascending: false }),
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
          profilesRes.data.forEach((p: any) => {
            names[p.id] = p.full_name || "Unknown";
          });
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
        // Admin View - DB ဝန်သက်သာအောင် ပြီးခဲ့သမျှအကုန်လုံး မယူဘဲ အသစ်ဆုံးအခု ၁၀၀/၁၅၀ ဝန်းကျင်ပဲ ကန့်သတ်ယူပါတယ်
        const [tasksRes, profilesRes, evRes, assRes] = await Promise.all([
          supabase.from("tasks").select("*").order("created_at", { ascending: false }).limit(150),
          profilesPromise,
          supabase.from("calendar_events").select("*").order("start_date", { ascending: false }).limit(100),
          supabase
            .from("calendar_event_assignments")
            .select("id, event_id, user_id, submission_status, submitted_at, approved_at, approved_by")
            .order("submitted_at", { ascending: false })
            .limit(150),
        ]);

        if (tasksRes.error) console.error("[Tasks] tasks fetch error:", tasksRes.error);
        if (profilesRes.error) console.error("[Tasks] profiles fetch error:", profilesRes.error);

        const names: Record<string, string> = {};
        if (profilesRes.data) {
          const staff = profilesRes.data.filter((p: any) => p.role === "staff");
          setStaffList(staff);
          profilesRes.data.forEach((p: any) => {
            names[p.id] = p.full_name || "Unknown";
          });
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
