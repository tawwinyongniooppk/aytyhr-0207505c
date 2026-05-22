import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Clock,
  AlertTriangle,
  FileText,
  TrendingDown,
  CalendarCheck,
  Loader2,
  ListChecks,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import { LeaveBalanceCard } from "@/components/LeaveBalanceCard";
import { useNotifications } from "@/hooks/useNotifications";

interface Profile {
  id: string;
  full_name: string;
}

interface AttendanceRow {
  id: string;
  user_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  late_minutes: number;
  early_minutes: number;
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
  const { hasFor } = useNotifications();
  const navigate = useNavigate();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRow[]>([]);
  const [monthAttendance, setMonthAttendance] = useState<AttendanceRow[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRow[]>([]);
  const [pendingTasks, setPendingTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [deductionRate, setDeductionRate] = useState(200);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const monthStart = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    [],
  );
  const monthEnd = useMemo(
    () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0],
    [],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        // Optimized: Removed the redundant 'today' query since 'today' is already inside the 'month' range.
        const [profilesRes, monthAttRes, leaveRes, settingsRes, pendingRes, completedRes] = await Promise.all([
          supabase.rpc("admin_list_profiles"),
          supabase
            .from("attendance")
            .select("id,user_id,date,check_in_time,check_out_time,late_minutes,early_minutes")
            .gte("date", monthStart)
            .lte("date", monthEnd),
          supabase
            .from("leave_requests")
            .select("id,user_id,date,type,status,reason,created_at")
            .gte("date", monthStart)
            .lte("date", monthEnd),
          supabase.from("app_settings").select("value").eq("key", "deduction_rate").maybeSingle(),
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("completed", false)
            .gte("created_at", monthStart),
          supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("completed", true)
            .gte("created_at", monthStart),
        ]);

        if (cancelled) return;

        const monthData = monthAttRes.data ?? [];

        setProfiles(profilesRes.data ?? []);
        setMonthAttendance(monthData);
        // Filter today's attendance directly from the monthly data to save a DB fetch
        setTodayAttendance(monthData.filter((a) => a.date === today));
        setLeaveRequests(leaveRes.data ?? []);

        if (settingsRes.data?.value) setDeductionRate(Number(settingsRes.data.value));
        setPendingTasks(pendingRes.count ?? 0);
        setCompletedTasks(completedRes.count ?? 0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [user, today, monthStart, monthEnd]);

  // Memoize data processing so we don't recalculate arrays on every render
  const profileMap = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])) as Record<string, Profile>,
    [profiles],
  );

  const totalStaff = profiles.length;

  const { presentToday, lateToday, todayDeductions } = useMemo(() => {
    let present = 0;
    let late = 0;
    let deductions = 0;
    todayAttendance.forEach((a) => {
      if (a.check_in_time) present++;
      if (a.late_minutes > 0) late++;
      deductions += (a.late_minutes + a.early_minutes) * deductionRate;
    });
    return { presentToday: present, lateToday: late, todayDeductions: deductions };
  }, [todayAttendance, deductionRate]);

  const { onLeaveToday, pendingRequests, approvedToday, rejectedToday } = useMemo(() => {
    const todayLeaves = leaveRequests.filter((l) => l.date === today && l.status === "approved" && l.type === "leave");
    const pending = leaveRequests.filter((l) => l.status === "pending");
    const approved = leaveRequests.filter((l) => l.date === today && l.status === "approved");
    const rejected = leaveRequests.filter((l) => l.date === today && l.status === "rejected");
    return {
      onLeaveToday: todayLeaves.length,
      pendingRequests: pending,
      approvedToday: approved,
      rejectedToday: rejected,
    };
  }, [leaveRequests, today]);

  const { monthDeductions, totalAttendanceDays, totalLateCases, topDeductions } = useMemo(() => {
    let totalDeds = 0;
    let attendanceDays = 0;
    let lateCases = 0;
    const deductionByUser: Record<string, number> = {};

    monthAttendance.forEach((a) => {
      if (a.check_in_time) attendanceDays++;
      if (a.late_minutes > 0) lateCases++;

      const userDeduction = (a.late_minutes + a.early_minutes) * deductionRate;
      totalDeds += userDeduction;
      deductionByUser[a.user_id] = (deductionByUser[a.user_id] || 0) + userDeduction;
    });

    const topDeds: TopDeduction[] = Object.entries(deductionByUser)
      .map(([uid, total]) => ({ name: profileMap[uid]?.full_name || "Unknown", total }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return {
      monthDeductions: totalDeds,
      totalAttendanceDays: attendanceDays,
      totalLateCases: lateCases,
      topDeductions: topDeds,
    };
  }, [monthAttendance, deductionRate, profileMap]);

  const summaryCards = [
    { label: "Total Staff", value: totalStaff, icon: Users, accent: "text-primary", to: "/staff" },
    { label: "Present Today", value: presentToday, icon: CalendarCheck, accent: "text-accent", to: "/attendance" },
    { label: "Late Today", value: lateToday, icon: AlertTriangle, accent: "text-destructive", to: "/attendance" },
    { label: "On Leave", value: onLeaveToday, icon: FileText, accent: "text-warning", to: "/leave" },
    {
      label: "Tasks",
      value: `${pendingTasks} pending • ${completedTasks} done`,
      icon: ListChecks,
      accent: "text-primary",
      to: "/tasks",
    },
    ...(canViewSalary
      ? [
          {
            label: "Today's Deductions",
            value: `${todayDeductions.toLocaleString()} Ks`,
            icon: TrendingDown,
            accent: "text-destructive",
            to: "/salaries-bonuses",
          },
        ]
      : []),
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
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
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
        <p className="text-muted-foreground text-sm mt-1">
          Today's overview —{" "}
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      <LeaveBalanceCard />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {summaryCards.map((card) => (
          <Card
            key={card.label}
            role="button"
            tabIndex={0}
            onClick={() => navigate(card.to)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(card.to);
              }
            }}
            className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
                <div className="relative">
                  <card.icon className={cn("h-4 w-4", card.accent)} />
                  {hasFor(card.to) && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-card animate-pulse" />
                  )}
                </div>
              </div>
              <div className="flex items-end justify-between gap-2">
                <p className="text-xl font-bold font-display">{card.value}</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 mb-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card
          className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
          onClick={() => navigate("/attendance")}
        >
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
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/attendance");
                      }}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0 rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                          {(profile?.full_name || "?")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
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

        <Card
          className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
          onClick={() => navigate("/leave")}
        >
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
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/leave");
                }}
                className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
              >
                <p className="text-xl font-bold text-amber-600">{pendingRequests.length}</p>
                <p className="text-xs text-amber-700 mt-1">Pending</p>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/leave");
                }}
                className="text-center p-3 rounded-lg bg-green-50 border border-green-200 cursor-pointer hover:bg-green-100 transition-colors"
              >
                <p className="text-xl font-bold text-green-600">{approvedToday.length}</p>
                <p className="text-xs text-green-700 mt-1">Approved</p>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/leave");
                }}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/leave");
                      }}
                      className="flex items-center justify-between py-1.5 border-b border-border last:border-0 rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{profileMap[r.user_id]?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.type} — {r.date}
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                        Pending
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {canViewSalary && (
          <Card
            className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
            onClick={() => navigate("/salaries-bonuses")}
          >
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
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/salaries-bonuses");
                }}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("/salaries-bonuses");
                        }}
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

        <Card
          className="border border-border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
          onClick={() => navigate("/attendance")}
        >
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
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/attendance");
                }}
                className="flex items-center justify-between py-2 border-b border-border rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
              >
                <span className="text-sm text-muted-foreground">Total Attendance Days</span>
                <span className="text-sm font-bold">{totalAttendanceDays}</span>
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/attendance");
                }}
                className="flex items-center justify-between py-2 border-b border-border rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
              >
                <span className="text-sm text-muted-foreground">Late Cases</span>
                <span className="text-sm font-bold text-destructive">{totalLateCases}</span>
              </div>
              {canViewSalary && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/salaries-bonuses");
                  }}
                  className="flex items-center justify-between py-2 rounded-md hover:bg-muted/50 px-2 -mx-2 cursor-pointer"
                >
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
