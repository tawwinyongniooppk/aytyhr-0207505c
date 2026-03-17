import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingDown, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SalaryData {
  base_salary: number;
  current_salary: number;
  total_deductions: number;
}

interface AttendanceEntry {
  date: string;
  late_minutes: number;
  early_minutes: number;
  deduction_applied: boolean;
}

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getMonthEnd(): string {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return lastDay.toISOString().split("T")[0];
}

export default function SalaryPage() {
  const { user } = useAuth();
  const [salary, setSalary] = useState<SalaryData | null>(null);
  const [deductionRate, setDeductionRate] = useState(200);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const monthStart = getMonthStart();
    const monthEnd = getMonthEnd();

    const [salRes, attRes, settRes] = await Promise.all([
      supabase.from("salaries").select("*").eq("user_id", user!.id).eq("month", monthStart).maybeSingle(),
      supabase.from("attendance").select("*").eq("user_id", user!.id).gte("date", monthStart).lte("date", monthEnd).order("date", { ascending: false }),
      supabase.from("app_settings").select("*").eq("key", "deduction_rate_per_minute").maybeSingle(),
    ]);

    if (salRes.data) setSalary(salRes.data as unknown as SalaryData);
    if (attRes.data) setAttendanceHistory(attRes.data as unknown as AttendanceEntry[]);
    if (settRes.data) setDeductionRate(Number((settRes.data as any).value) || 200);

    setLoading(false);
  };

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold font-display">Salary</h1></div>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Salary</h1>
        <p className="text-muted-foreground text-sm mt-1">{currentMonth}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border border-border shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Base Salary</span>
            </div>
            <p className="text-xl font-bold font-display">{(salary?.base_salary ?? 0).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kyats</span></p>
          </CardContent>
        </Card>
        <Card className="border border-secondary/30 shadow-none bg-secondary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-secondary" />
              <span className="text-xs text-muted-foreground">Remaining</span>
            </div>
            <p className="text-xl font-bold font-display text-secondary">{(salary?.current_salary ?? 0).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kyats</span></p>
          </CardContent>
        </Card>
        <Card className="border border-destructive/30 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Deductions</span>
            </div>
            <p className="text-xl font-bold font-display text-destructive">{(salary?.total_deductions ?? 0).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kyats</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Deduction History */}
      <Card className="border border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base font-display">Deduction Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {attendanceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No attendance records this month</p>
          ) : (
            <div className="space-y-2">
              {attendanceHistory.map((entry) => {
                const totalMin = entry.late_minutes + entry.early_minutes;
                const deduction = totalMin * deductionRate;
                const dateLabel = new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

                return (
                  <div key={entry.date} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{dateLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.late_minutes > 0 && `Late: ${entry.late_minutes}min`}
                        {entry.late_minutes > 0 && entry.early_minutes > 0 && " · "}
                        {entry.early_minutes > 0 && `Early: ${entry.early_minutes}min`}
                        {totalMin === 0 && "On time ✓"}
                      </p>
                    </div>
                    <div className="text-right">
                      {deduction > 0 ? (
                        <span className="text-sm font-semibold text-destructive">-{deduction.toLocaleString()} kyats</span>
                      ) : (
                        <span className="text-sm text-accent font-medium">No deduction</span>
                      )}
                      {entry.deduction_applied && deduction > 0 && (
                        <p className="text-xs text-muted-foreground">Applied</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
