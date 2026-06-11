import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, AlertTriangle, FileText, TrendingDown, CalendarCheck, Loader2, ListChecks, ChevronRight, Activity, CheckCircle2, UserX, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import { LeaveBalanceCard } from "@/components/LeaveBalanceCard";
import { useNotifications } from "@/hooks/useNotifications";
import { formatMMTDate, getMMTMonthEndISO, getMMTMonthStartISO, getMMTTodayISO } from "@/lib/mmt";

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
  const { canViewSalary, isStaff } = useProfile();
  const { hasFor } = useNotifications();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRow[]>([]);
  const [monthStats, setMonthStats] = useState<Array<{ user_id: string; total_late_minutes: number; total_early_minutes: number; days_present: number; late_cases: number }>>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRow[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [deductionRate, setDeductionRate] = useState(200);
  const [loading, setLoading] = useState(true);

  const today = getMMTTodayISO();
  const monthStart = getMMTMonthStartISO();
  const monthEnd = getMMTMonthEndISO();

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    const [profilesRes, todayAttRes, monthStatsRes, leaveRes, settingsRes, tasksRes] = await Promise.all([
      supabase.rpc("admin_list_profiles"),
      supabase.from("attendance").select("id,user_id,date,check_in_time,check_out_time,late_minutes,early_minutes,deduction_applied").eq("date", today),
      supabase.rpc("dashboard_monthly_attendance", { p_month_start: monthStart, p_month_end: monthEnd }),
      supabase.from("leave_requests").select("*").gte("date", monthStart).lte("date", monthEnd),
      supabase.from("app_settings").select("value").eq("key", "deduction_rate").maybeSingle(),
      supabase.from("tasks").select("completed").gte("created_at", monthStart),
    ]);

    setProfiles(profilesRes.data ?? []);
    setTodayAttendance((todayAttRes.data ?? []) as AttendanceRow[]);
    setMonthStats((monthStatsRes.data ?? []) as any);
    setLeaveRequests(leaveRes.data ?? []);
    if (settingsRes.data?.value) setDeductionRate(Number(settingsRes.data.value));
    const taskRows = (tasksRes.data ?? []) as { completed: boolean }[];
    setPendingTasks(taskRows.filter((t) => !t.completed).length);
    setCompletedTasks(taskRows.filter((t) => t.completed).length);
    setLoading(false);
  }

  // Only count Staff role for dashboard stats — IT Manager / Admin / Assistant excluded
  const staffProfiles = profiles.filter((p) => p.role === "staff");
  const staffIds = new Set(staffProfiles.map((p) => p.id));
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const totalStaff = staffProfiles.length;
  const staffAttendance = todayAttendance.filter((a) => staffIds.has(a.user_id));
  const presentToday = staffAttendance.filter((a) => a.check_in_time).length;
  const lateToday = staffAttendance.filter((a) => a.late_minutes > 0).length;

  const todayLeaves = leaveRequests.filter((l) => l.date === today && l.status === "approved" && l.type === "leave" && staffIds.has(l.user_id));
  const onLeaveToday = todayLeaves.length;

  const todayDeductions = staffAttendance.reduce(
    (sum, a) => sum + (a.late_minutes + a.early_minutes) * deductionRate,
    0
  );

  const pendingRequests = leaveRequests.filter((l) => l.status === "pending");
  const approvedToday = leaveRequests.filter((l) => l.date === today && l.status === "approved");
  const rejectedToday = leaveRequests.filter((l) => l.date === today && l.status === "rejected");

  // Monthly stats — aggregated server-side
  const monthDeductions = monthStats.reduce(
    (sum, s) => sum + (Number(s.total_late_minutes) + Number(s.total_early_minutes)) * deductionRate,
    0
  );
  const totalAttendanceDays = monthStats.reduce((sum, s) => sum + Number(s.days_present), 0);
  const totalLateCases = monthStats.reduce((sum, s) => sum + Number(s.late_cases), 0);

  // Top 3 deductions this month
  const topDeductions: TopDeduction[] = monthStats
    .map((s) => ({
      name: profileMap[s.user_id]?.full_name || "Unknown",
      total: (Number(s.total_late_minutes) + Number(s.total_early_minutes)) * deductionRate,
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);


  const summaryCards = [
    { label: "Total Staff", value: totalStaff, icon: Users, accent: "text-primary", to: "/staff" },
    { label: "Present Today", value: presentToday, icon: CalendarCheck, accent: "text-accent", to: "/attendance" },
    { label: "Late Today", value: lateToday, icon: AlertTriangle, accent: "text-destructive", to: "/attendance" },
    { label: "On Leave", value: onLeaveToday, icon: FileText, accent: "text-warning", to: "/leave" },
    { label: "Tasks", value: `${pendingTasks} pending • ${completedTasks} done`, icon: ListChecks, accent: "text-primary", to: "/tasks" },
    ...(canViewSalary ? [{ label: "Today's Deductions", value: `${todayDeductions.toLocaleString()} Ks`, icon: TrendingDown, accent: "text-destructive", to: "/salaries-bonuses" }] : []),
  ];

  function attendanceStatus(a: AttendanceRow) {
    if (!a.check_in_time) return { label: "Absent", cls: "bg-muted text-muted-foreground" };
    if (a.late_minutes > 0) return { label: `Late ${a.late_minutes}m`, cls: "bg-destructive/10 text-destructive" };
    return { label: "On time", cls: "bg-green-100 text-green-700" };
  }

  function formatTime(ts: string | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Yangon" });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Loading overview...</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
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

  const absentToday = Math.max(0, totalStaff - presentToday - onLeaveToday);
  const onTimeToday = Math.max(0, presentToday - lateToday);
  const attendanceRate = totalStaff > 0 ? Math.round((presentToday / totalStaff) * 100) : 0;
  const punctualityRate = presentToday > 0 ? Math.round((onTimeToday / presentToday) * 100) : 0;
  const taskTotal = pendingTasks + completedTasks;
  const taskCompletion = taskTotal > 0 ? Math.round((completedTasks / taskTotal) * 100) : 0;
  const avgDailyDeduction = totalAttendanceDays > 0 ? Math.round(monthDeductions / totalAttendanceDays) : 0;

  return (
    <div className="space-y-6">
      {/* Premium Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/5 p-5 md:p-7">
        <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-primary mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="uppercase tracking-wider">Live Overview</span>
            </div>
            <h1 className="text-3xl font-bold font-display tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">{formatMMTDate(new Date(), "en-US")} · Myanmar Standard Time</p>
          </div>
          <div className="grid grid-cols-3 gap-3 md:gap-5 md:min-w-[420px]">
            <div className="rounded-xl bg-card/70 backdrop-blur border border-border/60 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Attendance</p>
              <p className="text-lg font-bold font-display text-primary">{attendanceRate}%</p>
              <Progress value={attendanceRate} className="h-1 mt-1.5" />
            </div>
            <div className="rounded-xl bg-card/70 backdrop-blur border border-border/60 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Punctuality</p>
              <p className="text-lg font-bold font-display text-accent">{punctualityRate}%</p>
              <Progress value={punctualityRate} className="h-1 mt-1.5" />
            </div>
            <div className="rounded-xl bg-card/70 backdrop-blur border border-border/60 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tasks Done</p>
              <p className="text-lg font-bold font-display text-secondary">{taskCompletion}%</p>
              <Progress value={taskCompletion} className="h-1 mt-1.5" />
            </div>
          </div>
        </div>
      </div>

      <LeaveBalanceCard />

      {/* Pulse Strip — at-a-glance today */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div onClick={() => navigate("/attendance")} className="group cursor-pointer rounded-xl border border-border bg-gradient-to-br from-accent/5 to-transparent p-4 hover:border-accent/40 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-accent/80">On time</span>
          </div>
          <p className="text-2xl font-bold font-display mt-2">{onTimeToday}<span className="text-xs font-normal text-muted-foreground"> / {totalStaff}</span></p>
          <p className="text-xs text-muted-foreground mt-1">Checked in punctually</p>
        </div>
        <div onClick={() => navigate("/attendance")} className="group cursor-pointer rounded-xl border border-border bg-gradient-to-br from-destructive/5 to-transparent p-4 hover:border-destructive/40 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive/80">Late</span>
          </div>
          <p className="text-2xl font-bold font-display mt-2 text-destructive">{lateToday}</p>
          <p className="text-xs text-muted-foreground mt-1">Arrived after schedule</p>
        </div>
        <div onClick={() => navigate("/leave")} className="group cursor-pointer rounded-xl border border-border bg-gradient-to-br from-warning/5 to-transparent p-4 hover:border-warning/40 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <FileText className="h-4 w-4 text-warning" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-warning/80">On leave</span>
          </div>
          <p className="text-2xl font-bold font-display mt-2">{onLeaveToday}</p>
          <p className="text-xs text-muted-foreground mt-1">Approved absences</p>
        </div>
        <div onClick={() => navigate("/staff")} className="group cursor-pointer rounded-xl border border-border bg-gradient-to-br from-muted/30 to-transparent p-4 hover:border-primary/40 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <UserX className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Absent</span>
          </div>
          <p className="text-2xl font-bold font-display mt-2">{absentToday}</p>
          <p className="text-xs text-muted-foreground mt-1">Not checked in yet</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {summaryCards.map((card) => (
          <Card
            key={card.label}
            role="button"
            tabIndex={0}
            onClick={() => navigate(card.to)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(card.to); } }}
            className="group relative overflow-hidden border border-border shadow-sm hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</span>
                <div className="relative">
                  <div className={cn("h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center group-hover:bg-primary/10 transition-colors")}>
                    <card.icon className={cn("h-4 w-4", card.accent)} />
                  </div>
                  {hasFor(card.to) && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-card animate-pulse" />
                  )}
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <p className="text-xl font-bold font-display">{card.value}</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 mb-1 group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Today's Attendance */}
        <Card className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer" onClick={() => navigate("/attendance")}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Today's Attendance
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
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
                    <div
                      key={a.id}
                      onClick={(e) => { e.stopPropagation(); navigate("/attendance"); }}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0 rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
                    >
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
        <Card className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer" onClick={() => navigate("/leave")}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Leave & Requests
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div
                onClick={(e) => { e.stopPropagation(); navigate("/leave"); }}
                className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
              >
                <p className="text-xl font-bold text-amber-600">{pendingRequests.length}</p>
                <p className="text-xs text-amber-700 mt-1">Pending</p>
              </div>
              <div
                onClick={(e) => { e.stopPropagation(); navigate("/leave"); }}
                className="text-center p-3 rounded-lg bg-green-50 border border-green-200 cursor-pointer hover:bg-green-100 transition-colors"
              >
                <p className="text-xl font-bold text-green-600">{approvedToday.length}</p>
                <p className="text-xs text-green-700 mt-1">Approved</p>
              </div>
              <div
                onClick={(e) => { e.stopPropagation(); navigate("/leave"); }}
                className="text-center p-3 rounded-lg bg-red-50 border border-red-200 cursor-pointer hover:bg-red-100 transition-colors"
              >
                <p className="text-xl font-bold text-destructive">{rejectedToday.length}</p>
                <p className="text-xs text-red-700 mt-1">Rejected</p>
              </div>
            </div>
            {pendingRequests.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent pending</p>
                <div className="space-y-2">
                  {pendingRequests.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      onClick={(e) => { e.stopPropagation(); navigate("/leave"); }}
                      className="flex items-center justify-between py-1.5 border-b border-border last:border-0 rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
                    >
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
          <Card className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer" onClick={() => navigate("/salaries-bonuses")}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  Salary Impact — Today
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onClick={(e) => { e.stopPropagation(); navigate("/salaries-bonuses"); }}
                className="p-4 rounded-lg bg-destructive/5 border border-destructive/20 cursor-pointer hover:bg-destructive/10 transition-colors"
              >
                <p className="text-xs text-muted-foreground">Total Deductions Today</p>
                <p className="text-2xl font-bold text-destructive">{todayDeductions.toLocaleString()} Ks</p>
              </div>
              {topDeductions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Top deductions this month</p>
                  <div className="space-y-2">
                    {topDeductions.map((d, i) => (
                      <div
                        key={d.name}
                        onClick={(e) => { e.stopPropagation(); navigate("/salaries-bonuses"); }}
                        className="flex items-center justify-between py-1.5 border-b border-border last:border-0 rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
                      >
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
        <Card className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer" onClick={() => navigate("/attendance")}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                Monthly Report
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div
                onClick={(e) => { e.stopPropagation(); navigate("/attendance"); }}
                className="flex items-center justify-between py-2 border-b border-border rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
              >
                <span className="text-sm text-muted-foreground">Total Attendance Days</span>
                <span className="text-sm font-bold">{totalAttendanceDays}</span>
              </div>
              <div
                onClick={(e) => { e.stopPropagation(); navigate("/attendance"); }}
                className="flex items-center justify-between py-2 border-b border-border rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
              >
                <span className="text-sm text-muted-foreground">Late Cases</span>
                <span className="text-sm font-bold text-destructive">{totalLateCases}</span>
              </div>
              {canViewSalary && (
                <>
                  <div
                    onClick={(e) => { e.stopPropagation(); navigate("/salaries-bonuses"); }}
                    className="flex items-center justify-between py-2 border-b border-border rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
                  >
                    <span className="text-sm text-muted-foreground">Total Deductions</span>
                    <span className="text-sm font-bold text-destructive">{monthDeductions.toLocaleString()} Ks</span>
                  </div>
                  <div
                    onClick={(e) => { e.stopPropagation(); navigate("/salaries-bonuses"); }}
                    className="flex items-center justify-between py-2 rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
                  >
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Avg / Day</span>
                    <span className="text-sm font-bold">{avgDailyDeduction.toLocaleString()} Ks</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
