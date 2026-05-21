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

const TYPE_META: Record<LedgerType, { label: string; icon: any; bg: string; fg: string; badge: string }> = {
  salary: {
    label: "Salary",
    icon: Banknote,
    bg: "bg-secondary/10",
    fg: "text-secondary",
    badge: "bg-secondary/10 text-secondary",
  },
  bonus: { label: "Bonus", icon: Gift, bg: "bg-accent/10", fg: "text-accent", badge: "bg-accent/10 text-accent" },
  auto_deduction: {
    label: "Auto Deduction",
    icon: TrendingDown,
    bg: "bg-destructive/10",
    fg: "text-destructive",
    badge: "bg-destructive/10 text-destructive",
  },
  manual_deduction: {
    label: "Manual Deduction",
    icon: Minus,
    bg: "bg-destructive/10",
    fg: "text-destructive",
    badge: "bg-destructive/15 text-destructive",
  },
};

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
      // FIX 1: Database Date format error မတက်အောင် gte နှင့် lte သုံး၍ လတစ်လလုံးစာ ရှာပေးခြင်း
      supabase
        .from("salaries")
        .select("*")
        .eq("user_id", user!.id)
        .gte("month", monthStart)
        .lte("month", monthEnd)
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("attendance")
        .select("*")
        .eq("user_id", user!.id)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: false }),
      supabase.from("app_settings").select("*").eq("key", "deduction_rate_per_minute").maybeSingle(),
      supabase
        .from("leave_manual_deductions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false }),
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
        amount: 0,
      });
    }

    return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [salary, attendanceHistory, manualDeductions, deductionRate]);

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">My Salary & Bonus</h1>
        </div>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border border-border shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Base Salary</span>
            </div>
            <p className="text-lg font-bold font-display">
              {(salary?.base_salary ?? 0).toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border border-accent/30 shadow-none bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted-foreground">Bonus</span>
            </div>
            <p className="text-lg font-bold font-display text-accent">
              +{(salary?.bonus ?? 0).toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border border-destructive/30 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Deductions</span>
            </div>
            <p className="text-lg font-bold font-display text-destructive">
              -{((salary?.total_deductions ?? 0) + (salary?.manual_deduction ?? 0)).toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
            {salary?.manual_deduction ? (
              <p className="text-[10px] text-muted-foreground mt-1 truncate">
                incl. manual: {salary.manual_deduction.toLocaleString()}
                {salary.deduction_reason ? ` (${salary.deduction_reason})` : ""}
              </p>
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
              {Math.max(
                0,
                (salary?.base_salary ?? 0) +
                  (salary?.bonus ?? 0) -
                  (salary?.total_deductions ?? 0) -
                  (salary?.manual_deduction ?? 0),
              ).toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground"> Ks</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base font-display">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No transactions yet</p>
          ) : (
            <ul className="divide-y divide-border">
              {ledger.map((e) => {
                const meta = TYPE_META[e.type];
                const Icon = meta.icon;
                const dateLabel = e.date
                  ? new Date(e.date + "T00:00:00").toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "";
                const isCredit = e.amount > 0;

                return (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <div className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${meta.bg}`}>
                      <Icon className={`h-4 w-4 ${meta.fg}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-xs text-foreground/70">{dateLabel}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate mt-0.5">{e.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {/* FIX 2: အစင်းလိုင်း (—) အစား 0 Ks ဟု ရှင်းလင်းစွာ ပြသခြင်း */}
                      {e.amount === 0 ? (
                        <span className="text-sm font-semibold text-foreground/70">
                          0 <span className="text-[10px] font-normal">Ks</span>
                        </span>
                      ) : (
                        <span className={`text-sm font-semibold ${isCredit ? "text-accent" : "text-destructive"}`}>
                          {isCredit ? "+" : "-"}
                          {Math.abs(e.amount).toLocaleString()} <span className="text-[10px] font-normal">Ks</span>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
