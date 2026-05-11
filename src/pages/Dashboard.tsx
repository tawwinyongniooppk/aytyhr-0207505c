import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, AlertTriangle, FileText, TrendingDown, CalendarCheck, Loader2, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import { LeaveBalanceCard } from "@/components/LeaveBalanceCard";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  base_salary: number;
}

interface AttendanceRow {
  id: string;
  user_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  late_minutes: number;
  early_minutes: number;
  deduction_applied: boolean;
}

interface LeaveRow {
  id: string;
  user_id: string;
  date: string;
  type: string;
  status: string;
  reason: string;
  created_at: string;
}

interface TopDeduction {
  name: string;
  total: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { canViewSalary } = useProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRow[]>([]);
  const [monthAttendance, setMonthAttendance] = useState<AttendanceRow[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRow[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [deductionRate, setDeductionRate] = useState(200);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0];

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    const [profilesRes, todayAttRes, monthAttRes, leaveRes, settingsRes, tasksRes] = await Promise.all([
      supabase.rpc("admin_list_profiles"),
      supabase.from("attendance").select("*").eq("date", today),
      supabase.from("attendance").select("*").gte("date", monthStart).lte("date", monthEnd),
      supabase.from("leave_requests").select("*").gte("date", monthStart).lte("date", monthEnd),
      supabase.from("app_settings").select("*").eq("key", "deduction_rate").maybeSingle(),
      supabase.from("tasks").select("completed").gte("created_at", monthStart),
    ]);

    setProfiles(profilesRes.data ?? []);
    setTodayAttendance(todayAttRes.data ?? []);
    setMonthAttendance(monthAttRes.data ?? []);
    setLeaveRequests(leaveRes.data ?? []);
    if (settingsRes.data?.value) setDeductionRate(Number(settingsRes.data.value));
    const taskRows = (tasksRes.data ?? []) as { completed: boolean }[];
    setPendingTasks(taskRows.filter((t) => !t.completed).length);
    setCompletedTasks(taskRows.filter((t) => t.completed).length);
    setLoading(false);
  }

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const totalStaff = profiles.length;
  const presentToday = todayAttendance.filter((a) => a.check_in_time).length;
  const lateToday = todayAttendance.filter((a) => a.late_minutes > 0).length;

  const todayLeaves = leaveRequests.filter((l) => l.date === today && l.status === "approved" && l.type === "leave");
  const onLeaveToday = todayLeaves.length;

  const todayDeductions = todayAttendance.reduce(
    (sum, a) => sum + (a.late_minutes + a.early_minutes) * deductionRate,
    0
  );

  const pendingRequests = leaveRequests.filter((l) => l.status === "pending");
  const approvedToday = leaveRequests.filter((l) => l.date === today && l.status === "approved");
  const rejectedToday = leaveRequests.filter((l) => l.date === today && l.status === "rejected");

  // Monthly stats
  const monthDeductions = monthAttendance.reduce(
    (sum, a) => sum + (a.late_minutes + a.early_minutes) * deductionRate,
    0
  );
  const totalAttendanceDays = monthAttendance.filter((a) => a.check_in_time).length;
  const totalLateCases = monthAttendance.filter((a) => a.late_minutes > 0).length;

  // Top 3 deductions this month
  const deductionByUser: Record<string, number> = {};
  monthAttendance.forEach((a) => {
    deductionByUser[a.user_id] = (deductionByUser[a.user_id] || 0) + (a.late_minutes + a.early_minutes) * deductionRate;
  });
  const topDeductions: TopDeduction[] = Object.entries(deductionByUser)
    .map(([uid, total]) => ({ name: profileMap[uid]?.full_name || "Unknown", total }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const summaryCards = [
    { label: "Total Staff", value: totalStaff, icon: Users, accent: "text-primary" },
    { label: "Present Today", value: presentToday, icon: CalendarCheck, accent: "text-accent" },
    { label: "Late Today", value: lateToday, icon: AlertTriangle, accent: "text-destructive" },
    { label: "On Leave", value: onLeaveToday, icon: FileText, accent: "text-warning" },
    { label: "Tasks", value: `${pendingTasks} pending • ${completedTasks} done`, icon: ListChecks, accent: "text-primary" },
    ...(canViewSalary ? [{ label: "Today's Deductions", value: `${todayDeductions.toLocaleString()} Ks`, icon: TrendingDown, accent: "text-destructive" }] : []),
  ];

  function attendanceStatus(a: AttendanceRow) {
    if (!a.check_in_time) return { label: "Absent", cls: "bg-muted text-muted-foreground" };
    if (a.late_minutes > 0) return { label: `Late ${a.late_minutes}m`, cls: "bg-destructive/10 text-destructive" };
    return { label: "On time", cls: "bg-green-100 text-green-700" };
  }

  function formatTime(ts: string | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Loading overview...</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Today's overview — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      <LeaveBalanceCard />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="border border-border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
                <card.icon className={cn("h-4 w-4", card.accent)} />
              </div>
              <p className="text-xl font-bold font-display">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Today's Attendance */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Today's Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayAttendance.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No attendance records yet today.</p>
            ) : (
              <div className="space-y-2">
                {todayAttendance.map((a) => {
                  const profile = profileMap[a.user_id];
                  const status = attendanceStatus(a);
                  return (
                    <div key={a.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                          {(profile?.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{profile?.full_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">In: {formatTime(a.check_in_time)}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className={cn("text-xs shrink-0", status.cls)}>
                        {status.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leave & Approval */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Leave & Requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xl font-bold text-amber-600">{pendingRequests.length}</p>
                <p className="text-xs text-amber-700 mt-1">Pending</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-xl font-bold text-green-600">{approvedToday.length}</p>
                <p className="text-xs text-green-700 mt-1">Approved</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xl font-bold text-destructive">{rejectedToday.length}</p>
                <p className="text-xs text-red-700 mt-1">Rejected</p>
              </div>
            </div>
            {pendingRequests.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent pending</p>
                <div className="space-y-2">
                  {pendingRequests.slice(0, 3).map((r) => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{profileMap[r.user_id]?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{r.type} — {r.date}</p>
                      </div>
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">Pending</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Salary Impact - Admin only */}
        {canViewSalary && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                Salary Impact — Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-xs text-muted-foreground">Total Deductions Today</p>
                <p className="text-2xl font-bold text-destructive">{todayDeductions.toLocaleString()} Ks</p>
              </div>
              {topDeductions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Top deductions this month</p>
                  <div className="space-y-2">
                    {topDeductions.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}.</span>
                          <span className="text-sm font-medium">{d.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-destructive">{d.total.toLocaleString()} Ks</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Monthly Report */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              Monthly Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Total Attendance Days</span>
                <span className="text-sm font-bold">{totalAttendanceDays}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Late Cases</span>
                <span className="text-sm font-bold text-destructive">{totalLateCases}</span>
              </div>
              {canViewSalary && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Total Deductions</span>
                  <span className="text-sm font-bold text-destructive">{monthDeductions.toLocaleString()} Ks</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
