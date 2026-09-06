import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, AlertTriangle, FileText, TrendingDown, CalendarCheck, Loader2, ListChecks, ChevronRight, Activity, CheckCircle2, UserX, CalendarDays, ArrowUpRight, CircleCheck, BriefcaseBusiness } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import { LeaveBalanceCard } from "@/components/LeaveBalanceCard";
import { StaffLeaveBalancesCard } from "@/components/dashboard/StaffLeaveBalancesCard";
import { useNotifications } from "@/hooks/useNotifications";
import { formatMMTDate, getMMTMonthEndISO, getMMTMonthStartISO, getMMTTodayISO } from "@/lib/mmt";
import type { Json } from "@/integrations/supabase/types";
import { getMyanmarHoliday } from "@/lib/mmCalendar";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  base_salary: number;
  sequence?: number | null;
  work_schedule?: Json | null;
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
  const { canViewSalary, isStaff, isAssistant } = useProfile();
  const { hasFor } = useNotifications();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRow[]>([]);
  const [monthStats, setMonthStats] = useState<Array<{ user_id: string; total_late_minutes: number; total_early_minutes: number; days_present: number; late_cases: number }>>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRow[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [deductionRate, setDeductionRate] = useState(200);
  const [holidayOffUserIds, setHolidayOffUserIds] = useState<string[]>([]);
  const [isGlobalOffDay, setIsGlobalOffDay] = useState(false);
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

    const mmHoliday = getMyanmarHoliday(today);
    if (mmHoliday) {
      setIsGlobalOffDay(true);
      setHolidayOffUserIds(staffProfilesFromRpc(profilesRes.data ?? []).map((p) => p.id));
    } else {
      const holidayRes = await supabase
        .from("calendar_events")
        .select("id, assigned_to_all")
        .eq("event_type", "holiday")
        .lte("start_date", today)
        .gte("end_date", today);

      const holidayEvents = (holidayRes.data ?? []) as Array<{ id: string; assigned_to_all: boolean }>;
      if (holidayEvents.some((e) => e.assigned_to_all)) {
        setIsGlobalOffDay(true);
        setHolidayOffUserIds(staffProfilesFromRpc(profilesRes.data ?? []).map((p) => p.id));
      } else if (holidayEvents.length > 0) {
        const { data: assData } = await supabase
          .from("calendar_event_assignments")
          .select("user_id, event_id")
          .in("event_id", holidayEvents.map((e) => e.id));
        setIsGlobalOffDay(false);
        setHolidayOffUserIds(Array.from(new Set(((assData as Array<{ user_id: string }> | null) ?? []).map((a) => a.user_id))));
      } else {
        setIsGlobalOffDay(false);
        setHolidayOffUserIds([]);
      }
    }
    setLoading(false);
  }

  function staffProfilesFromRpc(rows: any[]): Profile[] {
    return rows as Profile[];
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
  const todayWeekday = new Date(`${today}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Yangon" });
  const isInactiveOffDay = (schedule: Json | null | undefined, weekday: string) => {
    if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return false;
    const day = (schedule as Record<string, any>)[weekday];
    return !!day && typeof day === "object" && day.active === false;
  };
  const offDayStaffIds = new Set(
    staffProfiles
      .filter((p) => isInactiveOffDay(p.work_schedule, todayWeekday))
      .map((p) => p.id),
  );
  holidayOffUserIds.forEach((id) => offDayStaffIds.add(id));

  const todayDeductions = staffAttendance.reduce(
    (sum, a) => sum + (a.late_minutes + a.early_minutes) * deductionRate,
    0
  );

  const pendingRequests = leaveRequests.filter((l) => l.status === "pending");
  const approvedToday = leaveRequests.filter((l) => l.date === today && l.status === "approved");
  const rejectedToday = leaveRequests.filter((l) => l.date === today && l.status === "rejected");

  // Monthly stats — aggregated server-side (Staff role only)
  const staffMonthStats = monthStats.filter((s) => staffIds.has(s.user_id));
  const monthDeductions = staffMonthStats.reduce(
    (sum, s) => sum + (Number(s.total_late_minutes) + Number(s.total_early_minutes)) * deductionRate,
    0
  );
  const totalAttendanceDays = staffMonthStats.reduce((sum, s) => sum + Number(s.days_present), 0);
  const totalLateCases = staffMonthStats.reduce((sum, s) => sum + Number(s.late_cases), 0);

  // Top 3 deductions this month
  const topDeductions: TopDeduction[] = staffMonthStats
    .map((s) => ({
      name: profileMap[s.user_id]?.full_name || "Unknown",
      total: (Number(s.total_late_minutes) + Number(s.total_early_minutes)) * deductionRate,
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);


  function attendanceStatus(a: AttendanceRow) {
    if (!a.check_in_time) return { label: "Absent", cls: "bg-muted text-muted-foreground" };
    if (a.late_minutes > 0) return { label: `Late ${a.late_minutes}m`, cls: "bg-destructive/10 text-destructive" };
    return { label: "On time", cls: "bg-success/10 text-success" };
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

  const activeStaffToday = isGlobalOffDay ? 0 : Math.max(0, totalStaff - offDayStaffIds.size);
  const absentToday = isGlobalOffDay ? 0 : Math.max(0, activeStaffToday - presentToday - onLeaveToday);
  const onTimeToday = Math.max(0, presentToday - lateToday);
  const attendanceRate = activeStaffToday > 0 ? Math.round((presentToday / activeStaffToday) * 100) : 0;
  const punctualityRate = presentToday > 0 ? Math.round((onTimeToday / presentToday) * 100) : 0;
  const taskTotal = pendingTasks + completedTasks;
  const taskCompletion = taskTotal > 0 ? Math.round((completedTasks / taskTotal) * 100) : 0;
  const avgDailyDeduction = totalAttendanceDays > 0 ? Math.round(monthDeductions / totalAttendanceDays) : 0;
  const adminStaffList = staffProfiles.map((p) => ({ id: p.id, full_name: p.full_name, sequence: p.sequence ?? null }));
  const attentionItems = [
    { label: "Pending leave", value: pendingRequests.length, icon: FileText, to: "/leave", tone: "warning" },
    { label: "Late today", value: lateToday, icon: AlertTriangle, to: "/attendance", tone: "destructive" },
    { label: "Absent today", value: absentToday, icon: UserX, to: "/attendance", tone: "muted" },
    { label: "Pending tasks", value: pendingTasks, icon: ListChecks, to: "/tasks", tone: "primary" },
  ] as const;

  const interactiveCard = "group cursor-pointer border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const sectionHeader = "flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5";

  return (
    <div className="space-y-5 pb-4">
      <section className="overflow-hidden rounded-lg border border-border bg-secondary text-secondary-foreground shadow-sm">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.85fr)] lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-secondary-foreground/65">
              <BriefcaseBusiness className="h-4 w-4" />
              {isAssistant ? "Operations workspace" : "HR command center"}
            </div>
            <h1 className="text-2xl font-bold font-display sm:text-3xl">
              {isAssistant ? "Assistant Admin Dashboard" : "Admin Dashboard"}
            </h1>
            <p className="mt-2 text-sm text-secondary-foreground/70">
              {formatMMTDate(new Date(), "en-US")} · Myanmar Standard Time
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-secondary-foreground/15 bg-secondary-foreground/15 sm:grid-cols-4">
            {[
              { label: "Attendance", value: `${attendanceRate}%`, progress: attendanceRate },
              { label: "Punctuality", value: `${punctualityRate}%`, progress: punctualityRate },
              { label: "Active staff", value: activeStaffToday, detail: `${offDayStaffIds.size} off today` },
              { label: "Tasks done", value: `${taskCompletion}%`, progress: taskCompletion },
            ].map((item) => (
              <div key={item.label} className="min-h-24 bg-secondary/95 p-3.5">
                <p className="text-[10px] font-semibold uppercase text-secondary-foreground/55">{item.label}</p>
                <p className="mt-1 text-xl font-bold font-display tabular-nums">{item.value}</p>
                {item.progress !== undefined ? (
                  <Progress value={item.progress} className="mt-3 h-1 bg-secondary-foreground/15 [&>div]:bg-accent" />
                ) : (
                  <p className="mt-2 text-[11px] text-secondary-foreground/60">{item.detail}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {isStaff && <LeaveBalanceCard />}
      {!isStaff && (
        <section aria-labelledby="attention-title" className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-1 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 id="attention-title" className="flex items-center gap-2 text-base font-semibold font-display">
                <AlertTriangle className="h-4 w-4 text-warning" /> Needs Attention
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Items that may need follow-up today</p>
            </div>
            <Badge variant="secondary" className="mt-2 w-fit sm:mt-0">
              {attentionItems.reduce((sum, item) => sum + item.value, 0)} open items
            </Badge>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4">
            {attentionItems.map((item, index) => {
              const calm = item.value === 0;
              const toneClass = calm
                ? "text-success bg-success/10"
                : item.tone === "warning"
                  ? "text-warning bg-warning/10"
                  : item.tone === "destructive"
                    ? "text-destructive bg-destructive/10"
                    : item.tone === "primary"
                      ? "text-primary bg-primary/10"
                      : "text-foreground bg-muted";
              return (
                <div
                  key={item.label}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(item.to)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(item.to); } }}
                  className={cn("group flex min-h-24 cursor-pointer items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", index > 0 && "border-t border-border/70 sm:border-l", index === 2 && "sm:border-l-0 lg:border-l", index > 1 && "sm:border-t lg:border-t-0")}
                >
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", toneClass)}>
                    {calm ? <CircleCheck className="h-5 w-5" /> : <item.icon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-bold font-display tabular-nums">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{calm ? `${item.label} · Clear` : item.label}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!isStaff && (
        <section aria-labelledby="workforce-title" className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <Card className="overflow-hidden border border-border bg-card shadow-sm">
            <div className={sectionHeader}>
              <div>
                <CardTitle id="workforce-title" className="flex items-center gap-2 text-base font-display">
                  <Users className="h-4 w-4 text-primary" /> Today's Workforce
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Staff availability and attendance at a glance</p>
              </div>
              <button onClick={() => navigate("/staff")} className="group flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open staff setup">
                View staff <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            </div>
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
                {[
                  { label: "Total staff", value: totalStaff, detail: "All staff", accent: "text-foreground" },
                  { label: "Working today", value: activeStaffToday, detail: `${attendanceRate}% present`, accent: "text-primary" },
                  { label: "Present", value: presentToday, detail: `${onTimeToday} on time`, accent: "text-success" },
                  { label: "Off day", value: offDayStaffIds.size, detail: isGlobalOffDay ? "Global off day" : "Not scheduled", accent: "text-muted-foreground" },
                ].map((metric) => (
                  <div key={metric.label} className="bg-card p-4">
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">{metric.label}</p>
                    <p className={cn("mt-2 text-3xl font-bold font-display tabular-nums", metric.accent)}>{metric.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-md bg-muted/45 px-2 py-3 text-center">
                <div className="px-2"><p className="text-lg font-bold font-display tabular-nums">{onTimeToday}</p><p className="text-[11px] text-muted-foreground">On time</p></div>
                <div className="px-2"><p className="text-lg font-bold font-display text-destructive tabular-nums">{lateToday}</p><p className="text-[11px] text-muted-foreground">Late</p></div>
                <div className="px-2"><p className="text-lg font-bold font-display text-warning tabular-nums">{onLeaveToday}</p><p className="text-[11px] text-muted-foreground">On leave</p></div>
              </div>
            </CardContent>
          </Card>
          <StaffLeaveBalancesCard staff={adminStaffList} />
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-12">
        <Card role="button" tabIndex={0} onClick={() => navigate("/attendance")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/attendance"); } }} className={cn(interactiveCard, "overflow-hidden lg:col-span-7")}>
          <div className={sectionHeader}>
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-display"><Clock className="h-4 w-4 text-primary" /> Today's Attendance</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Live records already loaded for today</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <CardContent className="p-4 sm:p-5">
            {staffAttendance.length === 0 ? (
              <div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-4 text-center">
                <Clock className="mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium">No attendance records yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Today’s check-ins will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {staffAttendance
                  .filter((a) => !offDayStaffIds.has(a.user_id))
                  .map((a) => {
                  const profile = profileMap[a.user_id];
                  const status = attendanceStatus(a);
                  return (
                    <div
                      key={a.id}
                      onClick={(e) => { e.stopPropagation(); navigate("/attendance"); }}
                       className="flex min-h-14 items-center justify-between gap-3 px-2 py-2.5 transition-colors hover:bg-muted/45"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                         <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                          {(profile?.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                           <p className="truncate text-sm font-semibold">{profile?.full_name || "Unknown"}</p>
                           <p className="text-xs text-muted-foreground">Checked in · {formatTime(a.check_in_time)}</p>
                        </div>
                      </div>
                       <Badge variant="secondary" className={cn("shrink-0 rounded-md text-xs", status.cls)}>
                        {status.label}
                      </Badge>
                    </div>
                  );
                 })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card role="button" tabIndex={0} onClick={() => navigate("/leave")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/leave"); } }} className={cn(interactiveCard, "overflow-hidden lg:col-span-5")}>
          <div className={sectionHeader}>
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-display"><FileText className="h-4 w-4 text-warning" /> Leave & Requests</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Review status for the current period</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Pending", value: pendingRequests.length, cls: "border-warning/30 bg-warning/10 text-warning" },
                { label: "Approved", value: approvedToday.length, cls: "border-success/25 bg-success/10 text-success" },
                { label: "Rejected", value: rejectedToday.length, cls: "border-destructive/25 bg-destructive/10 text-destructive" },
              ].map((item) => (
                <div key={item.label} className={cn("rounded-md border p-3 text-center", item.cls)}>
                  <p className="text-xl font-bold font-display tabular-nums">{item.value}</p>
                  <p className="mt-1 text-[11px] font-medium">{item.label}</p>
                </div>
              ))}
            </div>
            {pendingRequests.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Recent pending</p>
                <div className="divide-y divide-border rounded-md border border-border">
                  {pendingRequests.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      onClick={(e) => { e.stopPropagation(); navigate("/leave"); }}
                      className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-muted/45"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{profileMap[r.user_id]?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{r.type} — {r.date}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-md bg-warning/10 text-xs text-warning">Pending</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </section>

      <section className={cn("grid gap-5", canViewSalary ? "lg:grid-cols-12" : "lg:grid-cols-1")}>
        {canViewSalary && (
          <Card role="button" tabIndex={0} onClick={() => navigate("/salaries-bonuses")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/salaries-bonuses"); } }} className={cn(interactiveCard, "overflow-hidden lg:col-span-5")}>
            <div className={sectionHeader}>
              <div><CardTitle className="flex items-center gap-2 text-base font-display"><TrendingDown className="h-4 w-4 text-destructive" /> Salary Impact</CardTitle><p className="mt-1 text-xs text-muted-foreground">Today and current month</p></div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
                <p className="text-xs font-medium text-muted-foreground">Total deductions today</p>
                <p className="mt-1 text-2xl font-bold font-display text-destructive tabular-nums">{todayDeductions.toLocaleString()} Ks</p>
              </div>
              {topDeductions.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Top deductions this month</p>
                  <div className="divide-y divide-border">
                    {topDeductions.map((d, i) => (
                      <div
                        key={d.name}
                        onClick={(e) => { e.stopPropagation(); navigate("/salaries-bonuses"); }}
                        className="flex items-center justify-between gap-3 px-2 py-2.5 transition-colors hover:bg-muted/45"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">{i + 1}</span>
                          <span className="text-sm font-semibold">{d.name}</span>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-destructive tabular-nums">{d.total.toLocaleString()} Ks</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card role="button" tabIndex={0} onClick={() => navigate("/attendance")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/attendance"); } }} className={cn(interactiveCard, "overflow-hidden", canViewSalary ? "lg:col-span-7" : "w-full")}>
          <div className={sectionHeader}>
            <div><CardTitle className="flex items-center gap-2 text-base font-display"><CalendarCheck className="h-4 w-4 text-primary" /> Monthly Management Summary</CardTitle><p className="mt-1 text-xs text-muted-foreground">Attendance and deduction overview</p></div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <CardContent className="p-4 sm:p-5">
            <div className={cn("grid gap-px overflow-hidden rounded-md border border-border bg-border", canViewSalary ? "grid-cols-2" : "sm:grid-cols-2")}>
              <div
                onClick={(e) => { e.stopPropagation(); navigate("/attendance"); }}
                className="bg-card p-4 transition-colors hover:bg-muted/35"
              >
                <p className="text-xs text-muted-foreground">Attendance days</p>
                <p className="mt-2 text-2xl font-bold font-display tabular-nums">{totalAttendanceDays}</p>
              </div>
              <div
                onClick={(e) => { e.stopPropagation(); navigate("/attendance"); }}
                className="bg-card p-4 transition-colors hover:bg-muted/35"
              >
                <p className="text-xs text-muted-foreground">Late cases</p>
                <p className="mt-2 text-2xl font-bold font-display text-destructive tabular-nums">{totalLateCases}</p>
              </div>
              {canViewSalary && (
                <>
                  <div
                    onClick={(e) => { e.stopPropagation(); navigate("/salaries-bonuses"); }}
                    className="bg-card p-4 transition-colors hover:bg-muted/35"
                  >
                    <p className="text-xs text-muted-foreground">Total deductions</p>
                    <p className="mt-2 text-xl font-bold font-display text-destructive tabular-nums">{monthDeductions.toLocaleString()} Ks</p>
                  </div>
                  <div
                    onClick={(e) => { e.stopPropagation(); navigate("/salaries-bonuses"); }}
                    className="bg-card p-4 transition-colors hover:bg-muted/35"
                  >
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity className="h-3.5 w-3.5" /> Average / day</p>
                    <p className="mt-2 text-xl font-bold font-display tabular-nums">{avgDailyDeduction.toLocaleString()} Ks</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
