import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingDown, DollarSign, Gift, Minus, Banknote, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMMTDate, formatMMTMonthLabel, getMMTDateParts, getMMTMonthStartISO } from "@/lib/mmt";

type LedgerType = "salary" | "bonus" | "auto_deduction" | "manual_deduction" | "manual_addition" | "auto_addition";
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
  manual_addition: {
    label: "Manual Addition",
    icon: Plus,
    bg: "bg-accent/10",
    fg: "text-accent",
    badge: "bg-accent/15 text-accent",
  },
  auto_addition: {
    label: "Auto Addition",
    icon: Plus,
    bg: "bg-primary/10",
    fg: "text-primary",
    badge: "bg-primary/15 text-primary",
  },
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

function getMonthStart(): string {
  return getMMTMonthStartISO();
}

export default function SalaryPage() {
  const { user } = useAuth();
  const [salary, setSalary] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualLeaveDeductions, setManualLeaveDeductions] = useState<any[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<any[]>([]);
  const [bonusTxs, setBonusTxs] = useState<any[]>([]);
  const [manualAdditions, setManualAdditions] = useState<any[]>([]);
  const [rates, setRates] = useState<{ late: number; early: number }>({ late: 200, early: 200 });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const monthStart = getMonthStart();

    const [salRes, mdRes, attRes, lvRes, profRes, btRes, addRes] = await Promise.all([
      supabase
        .from("salaries")
        .select("base_salary, current_salary, total_deductions, bonus, manual_deduction, deduction_reason")
        .eq("user_id", user!.id)
        .eq("month", monthStart)
        .maybeSingle(),
      supabase
        .from("leave_manual_deductions")
        .select("*")
        .eq("user_id", user!.id)
        .gte("created_at", monthStart)
        .order("created_at", { ascending: false }),
      supabase
        .from("attendance")
        .select("date, late_minutes, early_minutes")
        .eq("user_id", user!.id)
        .gte("date", monthStart)
        .order("date", { ascending: false }),
      supabase
        .from("leave_requests")
        .select("date, type, payment_type, status")
        .eq("user_id", user!.id)
        .eq("status", "approved")
        .gte("date", monthStart),
      supabase
        .from("profiles")
        .select("late_deduction_per_minute, early_deduction_per_minute, deduction_rate_per_minute, base_salary")
        .eq("id", user!.id)
        .maybeSingle(),
      supabase
        .from("bonus_transactions")
        .select("id, title, amount, unit_count, deadline_date, approved_date, auto_approved")
        .eq("user_id", user!.id)
        .eq("month", monthStart)
        .order("approved_date", { ascending: false }),
      supabase
        .from("salary_manual_additions")
        .select("*")
        .eq("user_id", user!.id)
        .eq("month", monthStart)
        .order("created_at", { ascending: false }),
    ]);

    if (salRes.data) setSalary(salRes.data as unknown as SalaryData);
    else if (profRes.data) {
      // No salary row yet — fall back to profile base so Base/Final displays correctly on day 1.
      const baseFromProfile = Number((profRes.data as any).base_salary) || 0;
      setSalary({
        base_salary: baseFromProfile,
        current_salary: baseFromProfile,
        total_deductions: 0,
        bonus: 0,
        manual_deduction: 0,
        deduction_reason: "",
      });
    }
    if (mdRes.data) setManualLeaveDeductions(mdRes.data as any[]);
    if (attRes.data) setAttendanceRows(attRes.data as any[]);
    if (lvRes.data) setApprovedLeaves(lvRes.data as any[]);
    if (btRes.data) setBonusTxs(btRes.data as any[]);
    if (addRes.data) setManualAdditions(addRes.data as any[]);
    if (profRes.data) {
      const legacy = Number((profRes.data as any).deduction_rate_per_minute) || 200;
      setRates({
        late: Number((profRes.data as any).late_deduction_per_minute) || legacy,
        early: Number((profRes.data as any).early_deduction_per_minute) || legacy,
      });
    }

    setLoading(false);
  };


  // Earned bonus = sum of approved bonus_transactions for the month (NOT the monthly bonus pot).
  const baseSalary = Math.max(0, Number(salary?.base_salary ?? 0));
  const earnedBonus = bonusTxs.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const totalBonus = earnedBonus;
  const autoAdditions = manualAdditions
    .filter((a) => (a.kind || "manual") === "auto")
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const manualAddTotal = manualAdditions
    .filter((a) => (a.kind || "manual") === "manual")
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const totalAdditions = autoAdditions + manualAddTotal;
  const autoDeductions = Math.max(0, Number(salary?.total_deductions ?? 0));
  const manualDeductionAmt = Math.max(0, Number(salary?.manual_deduction ?? 0));
  const totalDeductions = autoDeductions + manualDeductionAmt;
  const finalSalary = baseSalary + totalBonus + totalAdditions - totalDeductions;


  const ledger = useMemo<LedgerEntry[]>(() => {
    const items: LedgerEntry[] = [];
    const monthStart = getMonthStart();
    const monthLabel = formatMMTMonthLabel(`${monthStart}T00:00:00+06:30`);

    if (baseSalary > 0) {
      items.push({
        id: `salary-${monthStart}`,
        date: monthStart,
        type: "salary",
        description: `Base salary (${monthLabel})`,
        amount: baseSalary,
      });
    }
    if (bonusTxs.length > 0) {
      for (const b of bonusTxs) {
        items.push({
          id: `bonus-tx-${b.id}`,
          date: b.approved_date || b.deadline_date || monthStart,
          type: "bonus",
          description: `${b.title || "Bonus"} · Deadline ${b.deadline_date || "—"} · Approved ${b.approved_date || "—"}${b.auto_approved ? " (auto)" : ""}`,
          amount: b.amount,
        });
      }
    }

    // Salary additions (Admin manual or system-issued OT auto)
    for (const a of manualAdditions) {
      const isAuto = (a.kind || "manual") === "auto";
      items.push({
        id: `add-${a.id}`,
        date: (() => {
          const { year, month, day } = getMMTDateParts(a.created_at);
          return `${year}-${month}-${day}`;
        })(),
        type: isAuto ? "auto_addition" : "manual_addition",
        description: a.title,
        amount: Number(a.amount) || 0,
      });
    }



    // Per-day auto deductions from attendance, excluding paid-excused days
    const leaveByDate = new Map<string, Set<string>>();
    for (const l of approvedLeaves) {
      if ((l.payment_type ?? "paid") !== "paid") continue;
      const set = leaveByDate.get(l.date) ?? new Set<string>();
      set.add(l.type);
      leaveByDate.set(l.date, set);
    }
    for (const a of attendanceRows) {
      const lateMin = a.late_minutes ?? 0;
      const earlyMin = a.early_minutes ?? 0;
      if (lateMin === 0 && earlyMin === 0) continue;
      const excuses = leaveByDate.get(a.date) ?? new Set<string>();
      const lateExcused = excuses.has("leave") || excuses.has("late_excuse") || excuses.has("partial_leave");
      const earlyExcused = excuses.has("leave") || excuses.has("partial_leave");
      const effLate = lateExcused ? 0 : lateMin;
      const effEarly = earlyExcused ? 0 : earlyMin;
      const amount = effLate * rates.late + effEarly * rates.early;
      if (amount <= 0) continue;
      const parts: string[] = [];
      if (effLate > 0) parts.push(`Late ${effLate} min × ${rates.late}`);
      if (effEarly > 0) parts.push(`Early ${effEarly} min × ${rates.early}`);
      const dayNum = Number(a.date.slice(8, 10));
      items.push({
        id: `auto-${a.date}`,
        date: a.date,
        type: "auto_deduction",
        description: `Day ${dayNum} — ${parts.join(" · ")}`,
        amount: -amount,
      });
    }

    if (manualDeductionAmt > 0) {
      items.push({
        id: `manual-${monthStart}`,
        date: monthStart,
        type: "manual_deduction",
        description: salary?.deduction_reason || "Manual salary deduction",
        amount: -manualDeductionAmt,
      });
    }

    // Informational rows for manual leave-day deductions (not a money amount)
    for (const md of manualLeaveDeductions) {
      items.push({
        id: `md-${md.id}`,
        date: (md.created_at || "").slice(0, 10),
        type: "manual_deduction",
        description: `${md.title}${md.reason ? ` — ${md.reason}` : ""} (${md.days} day${md.days > 1 ? "s" : ""} leave)`,
        amount: 0,
      });
    }

    return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [baseSalary, totalBonus, manualDeductionAmt, salary?.deduction_reason, manualLeaveDeductions, attendanceRows, approvedLeaves, rates, bonusTxs, manualAdditions]);


  const currentMonth = formatMMTMonthLabel(new Date());

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="border border-border shadow-none min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Base Salary</span>
            </div>
            <p className="text-base sm:text-lg font-bold font-display break-words">
              {baseSalary.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border border-accent/30 shadow-none bg-accent/5 min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="h-4 w-4 text-accent shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Bonus</span>
            </div>
            <p className="text-base sm:text-lg font-bold font-display text-accent break-words">
              +{totalBonus.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border border-primary/30 shadow-none bg-primary/5 min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Plus className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Additions</span>
            </div>
            <p className="text-base sm:text-lg font-bold font-display text-primary break-words">
              +{totalAdditions.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 break-words">
              Auto: {autoAdditions.toLocaleString()} · Manual: {manualAddTotal.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-destructive/30 shadow-none bg-destructive/5 min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Deductions</span>
            </div>
            <p className="text-base sm:text-lg font-bold font-display text-destructive break-words">
              -{totalDeductions.toLocaleString()}{" "}
              <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 break-words">
              Auto: {autoDeductions.toLocaleString()} · Manual: {manualDeductionAmt.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-secondary/30 shadow-none bg-secondary/5 min-w-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-secondary shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Final Salary</span>
            </div>
            <p className="text-base sm:text-lg font-bold font-display text-secondary break-words">
              {finalSalary.toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground"> Ks</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border shadow-none bg-muted/30">
        <CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
            Salary Formula
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            <span className="text-foreground">{baseSalary.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">Base</span>
            <span className="text-muted-foreground">+</span>
            <span className="text-accent">{totalBonus.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">Bonus</span>
            <span className="text-muted-foreground">+</span>
            <span className="text-primary">{totalAdditions.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">Additions</span>
            <span className="text-muted-foreground">−</span>
            <span className="text-destructive">{totalDeductions.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">Deductions</span>
            <span className="text-muted-foreground">=</span>
            <span className="text-secondary font-bold">{finalSalary.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">Final Ks</span>
          </div>
        </CardContent>
      </Card>

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
                const dateLabel = e.date ? formatMMTDate(`${e.date}T00:00:00+06:30`) : "";
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
