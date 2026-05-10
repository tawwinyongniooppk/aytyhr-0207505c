import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingDown, DollarSign, Gift, Minus, Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type LedgerType = "salary" | "bonus" | "auto_deduction" | "manual_deduction";
interface LedgerEntry {
  id: string;
  date: string; // ISO
  type: LedgerType;
  description: string;
  amount: number; // signed: positive credit, negative debit
}

interface SalaryData {
  base_salary: number;
  current_salary: number;
  total_deductions: number;
  bonus: number;
  manual_deduction: number;
  deduction_reason: string;
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
  const [manualDeductions, setManualDeductions] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const monthStart = getMonthStart();
    const monthEnd = getMonthEnd();

    const [salRes, attRes, settRes, mdRes] = await Promise.all([
      supabase.from("salaries").select("*").eq("user_id", user!.id).eq("month", monthStart).maybeSingle(),
      supabase.from("attendance").select("*").eq("user_id", user!.id).gte("date", monthStart).lte("date", monthEnd).order("date", { ascending: false }),
      supabase.from("app_settings").select("*").eq("key", "deduction_rate_per_minute").maybeSingle(),
      supabase.from("leave_manual_deductions").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }),
    ]);

    if (salRes.data) setSalary(salRes.data as unknown as SalaryData);
    if (attRes.data) setAttendanceHistory(attRes.data as unknown as AttendanceEntry[]);
    if (settRes.data) setDeductionRate(Number((settRes.data as any).value) || 200);
    if (mdRes.data) setManualDeductions(mdRes.data as any[]);

    setLoading(false);
  };

  const ledger = useMemo<LedgerEntry[]>(() => {
    const items: LedgerEntry[] = [];
    const monthStart = getMonthStart();

    if (salary) {
      if (salary.base_salary > 0) {
        items.push({
          id: `salary-${monthStart}`,
          date: monthStart,
          type: "salary",
          description: `Base salary (${new Date(monthStart + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })})`,
          amount: salary.base_salary,
        });
      }
      if (salary.bonus > 0) {
        items.push({
          id: `bonus-${monthStart}`,
          date: monthStart,
          type: "bonus",
          description: salary.deduction_reason ? `Bonus approved` : "Bonus approved",
          amount: salary.bonus,
        });
      }
      if (salary.manual_deduction > 0) {
        items.push({
          id: `manual-sal-${monthStart}`,
          date: monthStart,
          type: "manual_deduction",
          description: salary.deduction_reason || "Manual salary deduction",
          amount: -salary.manual_deduction,
        });
      }
    }

    for (const entry of attendanceHistory) {
      const totalMin = (entry.late_minutes || 0) + (entry.early_minutes || 0);
      const amt = totalMin * deductionRate;
      if (amt > 0) {
        const parts: string[] = [];
        if (entry.late_minutes > 0) parts.push(`Late ${entry.late_minutes}m`);
        if (entry.early_minutes > 0) parts.push(`Early ${entry.early_minutes}m`);
        items.push({
          id: `auto-${entry.date}`,
          date: entry.date,
          type: "auto_deduction",
          description: parts.join(" · ") || "Attendance deduction",
          amount: -amt,
        });
      }
    }

    for (const md of manualDeductions) {
      items.push({
        id: `md-${md.id}`,
        date: (md.created_at || "").slice(0, 10),
        type: "manual_deduction",
        description: `${md.title}${md.reason ? ` — ${md.reason}` : ""} (${md.days} day${md.days > 1 ? "s" : ""} leave)`,
        amount: 0, // leave-balance deduction; no kyats impact here
      });
    }

    return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [salary, attendanceHistory, manualDeductions, deductionRate]);

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold font-display">My Salary & Bonus</h1></div>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">My Salary & Bonus</h1>
        <p className="text-muted-foreground text-sm mt-1">{currentMonth}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border border-border shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Base Salary</span>
            </div>
            <p className="text-lg font-bold font-display">{(salary?.base_salary ?? 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span></p>
          </CardContent>
        </Card>
        <Card className="border border-accent/30 shadow-none bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted-foreground">Bonus</span>
            </div>
            <p className="text-lg font-bold font-display text-accent">+{(salary?.bonus ?? 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span></p>
          </CardContent>
        </Card>
        <Card className="border border-destructive/30 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Deductions</span>
            </div>
            <p className="text-lg font-bold font-display text-destructive">
              -{((salary?.total_deductions ?? 0) + (salary?.manual_deduction ?? 0)).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
            {salary?.manual_deduction ? (
              <p className="text-[10px] text-muted-foreground mt-1 truncate">incl. manual: {salary.manual_deduction.toLocaleString()}{salary.deduction_reason ? ` (${salary.deduction_reason})` : ""}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="border border-secondary/30 shadow-none bg-secondary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-secondary" />
              <span className="text-xs text-muted-foreground">Final Salary</span>
            </div>
            <p className="text-lg font-bold font-display text-secondary">
              {Math.max(0, (salary?.base_salary ?? 0) + (salary?.bonus ?? 0) - (salary?.total_deductions ?? 0) - (salary?.manual_deduction ?? 0)).toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground"> Ks</span>
            </p>
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
