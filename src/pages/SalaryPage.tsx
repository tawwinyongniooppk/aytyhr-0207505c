import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingDown, DollarSign, Gift, Minus, Banknote, Plus, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { formatMMTMonthLabel, getMMTDateParts, getMMTMonthStartISO } from "@/lib/mmt";
import { YearlyBonusSection } from "@/components/YearlyBonusSection";
import SignatureSlipDialog from "@/components/SignatureSlipDialog";

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

const LEDGER_TYPE_ORDER: Record<LedgerType, number> = {
  salary: 0,
  bonus: 1,
  auto_addition: 2,
  manual_addition: 3,
  auto_deduction: 4,
  manual_deduction: 5,
};


interface SalaryData {
  base_salary: number;
  current_salary: number;
  total_deductions: number;
  bonus: number; // monthly bonus POT (admin-configured)
  manual_deduction: number;
  deduction_reason: string;
  last_updated: string;
}

function getMonthStart(): string {
  return getMMTMonthStartISO();
}

function getMMTDateISO(value: string | number | Date) {
  const { year, month, day } = getMMTDateParts(value);
  return `${year}-${month}-${day}`;
}

function getForgetCheckoutDate(title?: string | null, fallback?: string | null) {
  const matchedDate = title?.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1];
  if (matchedDate) return matchedDate;
  if (fallback) return getMMTDateISO(fallback);
  return getMonthStart();
}

export default function SalaryPage() {
  const { user } = useAuth();
  const { profile, isNeutralClass, isStaff } = useProfile();
  const [salary, setSalary] = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualLeaveDeductions, setManualLeaveDeductions] = useState<any[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<any[]>([]);
  const [bonusTxs, setBonusTxs] = useState<any[]>([]);
  const [manualAdditions, setManualAdditions] = useState<any[]>([]);
  const [manualDeductionsList, setManualDeductionsList] = useState<any[]>([]);
  const [rates, setRates] = useState<{ late: number; early: number }>({ late: 200, early: 200 });
  const [slipEnabled, setSlipEnabled] = useState(false);
  const [slipUntil, setSlipUntil] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [signOpen, setSignOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const slipActive = slipEnabled && !!slipUntil && nowMs < Date.parse(slipUntil);

  const loadSlipSetting = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["slip_signing_enabled", "slip_signing_enabled_until"]);
    let en = false, until: string | null = null;
    for (const r of (data as any[]) || []) {
      if (r.key === "slip_signing_enabled") en = r.value === "true";
      if (r.key === "slip_signing_enabled_until") until = r.value;
    }
    setSlipEnabled(en);
    setSlipUntil(until);
  };

  useEffect(() => {
    if (!user) return;
    loadData();
    loadSlipSetting();
    // Realtime: refresh when any of the user's salary-related rows change
    const ch = supabase
      .channel(`salary-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance", filter: `user_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "salaries", filter: `user_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_manual_deductions", filter: `user_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_manual_additions", filter: `user_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "bonus_transactions", filter: `user_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_manual_deductions", filter: `user_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests", filter: `user_id=eq.${user.id}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => loadSlipSetting())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);




  const loadData = async () => {
    setLoading(true);
    const monthStart = getMonthStart();
    const monthEndExclusive = (() => {
      const [y, m] = monthStart.split("-").map(Number);
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      return `${ny}-${String(nm).padStart(2, "0")}-01`;
    })();

    const [salRes, mdRes, attRes, lvRes, profRes, btRes, addRes, smdRes] = await Promise.all([
      supabase
        .from("salaries")
        // bonus = monthly POT (admin-set). Shown only in the "Monthly Bonus Plan"
        // info card; earned bonus in Final Salary is derived from approved units.
        .select("base_salary, current_salary, total_deductions, bonus, manual_deduction, deduction_reason, last_updated")
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
      (supabase as any)
        .from("salary_manual_deductions")
        .select("*")
        .eq("user_id", user!.id)
        .eq("month", monthStart)
        .order("created_at", { ascending: false }),
    ]);

    if (salRes.data) setSalary(salRes.data as unknown as SalaryData);
    else if (profRes.data) {
      const baseFromProfile = Number((profRes.data as any).base_salary) || 0;
      setSalary({
        base_salary: baseFromProfile,
        current_salary: baseFromProfile,
        total_deductions: 0,
        bonus: 0,
        manual_deduction: 0,
        deduction_reason: "",
        last_updated: new Date().toISOString(),
      });
    }
    if (mdRes.data) setManualLeaveDeductions(mdRes.data as any[]);
    if (attRes.data) setAttendanceRows(attRes.data as any[]);
    if (lvRes.data) setApprovedLeaves(lvRes.data as any[]);
    if (btRes.data) setBonusTxs(btRes.data as any[]);
    if (addRes.data) setManualAdditions(addRes.data as any[]);
    if ((smdRes as any).data) setManualDeductionsList((smdRes as any).data as any[]);
    if (profRes.data) {
      const legacy = Number((profRes.data as any).deduction_rate_per_minute) || 200;
      setRates({
        late: Number((profRes.data as any).late_deduction_per_minute) || legacy,
        early: Number((profRes.data as any).early_deduction_per_minute) || legacy,
      });
    }

    setLoading(false);
  };


  // === Bonus model ===
  // Monthly pot (admin-set) is split into 4 equal Units. Each approved unit during the
  // month earns 1/4 of the pot. Final Salary only reflects EARNED bonus, so Day 1 shows
  // 0 bonus and it grows as units are approved (1u, 2u, 3u, 4u).
  const baseSalary = Math.max(0, Number(salary?.base_salary ?? 0));
  const monthlyBonusPot = Math.max(0, Number(salary?.bonus ?? 0));
  const perUnitBonus = monthlyBonusPot > 0 ? Math.round(monthlyBonusPot / 4) : 0;

  const earnedUnits = Math.min(
    4,
    bonusTxs.reduce((sum, b) => sum + Math.max(0, Number(b.unit_count) || 0), 0),
  );

  const earnedBonusFromTxs = bonusTxs.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const earnedBonus = earnedBonusFromTxs;
  const totalBonus = earnedBonus;
  const autoAdditions = manualAdditions
    .filter((a) => (a.kind || "manual") === "auto")
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const manualAddTotal = manualAdditions
    .filter((a) => (a.kind || "manual") === "manual")
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const totalAdditions = autoAdditions + manualAddTotal;
  // Live auto-deduction from attendance rows (late + early × per-min rates) with paid-leave excuses.
  // This makes Transaction History and Final Salary update the instant a late check-in is recorded,
  // without waiting for check-out / the apply-attendance-deduction edge function to persist totals.
  const attendanceAutoDeduction = (() => {
    const leaveByDate = new Map<string, Set<string>>();
    for (const l of approvedLeaves) {
      if ((l.payment_type ?? "paid") !== "paid") continue;
      const set = leaveByDate.get(l.date) ?? new Set<string>();
      set.add(l.type);
      leaveByDate.set(l.date, set);
    }
    let total = 0;
    for (const a of attendanceRows) {
      const excuses = leaveByDate.get(a.date) ?? new Set<string>();
      const earlyExcused = excuses.has("leave") || excuses.has("partial_leave");
      total += (a.late_minutes ?? 0) * rates.late;
      if (!earlyExcused) total += (a.early_minutes ?? 0) * rates.early;
    }
    return total;
  })();
  const isAutoSource = (s: string) => s === "auto_early_out" || s === "partial_leave";
  const autoExtraTotal = manualDeductionsList
    .filter((d) => isAutoSource(d.source || "manual"))
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const manualDeductionTxTotal = manualDeductionsList
    .filter((d) => !isAutoSource(d.source || "manual"))
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const manualDeductionAmt = Math.max(0, Number(salary?.manual_deduction ?? 0)) + manualDeductionTxTotal;
  const totalAutoDeductions = attendanceAutoDeduction + autoExtraTotal;
  const totalDeductions = totalAutoDeductions + manualDeductionAmt;

  const finalSalary = baseSalary + totalBonus + totalAdditions - totalDeductions;


  const ledger = useMemo<LedgerEntry[]>(() => {
    const items: LedgerEntry[] = [];
    const monthStart = getMonthStart();
    const monthLabel = formatMMTMonthLabel(`${monthStart}T00:00:00+06:30`);

    if (baseSalary > 0) {
      items.push({
        id: `salary-${monthStart}`,
        date: salary?.last_updated ? getMMTDateISO(salary.last_updated) : monthStart,
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
      const earlyExcused = excuses.has("leave") || excuses.has("partial_leave");
      const effLate = lateMin;
      const effEarly = earlyExcused ? 0 : earlyMin;
      const dayNum = Number(a.date.slice(8, 10));
      if (effLate > 0) {
        const lateAmt = effLate * rates.late;
        items.push({
          id: `auto-late-${a.date}`,
          date: a.date,
          type: "auto_deduction",
          description: `Day ${dayNum} · Late Entry — ${effLate} min × ${rates.late.toLocaleString()} Ks/min`,
          amount: -lateAmt,
        });
      }
      if (effEarly > 0) {
        const earlyAmt = effEarly * rates.early;
        items.push({
          id: `auto-early-${a.date}`,
          date: a.date,
          type: "auto_deduction",
          description: `Day ${dayNum} · Early Check-out — ${effEarly} min × ${rates.early.toLocaleString()} Ks/min`,
          amount: -earlyAmt,
        });
      }
    }

    const legacyManual = Math.max(0, Number(salary?.manual_deduction ?? 0));
    if (legacyManual > 0) {
      items.push({
        id: `manual-${monthStart}`,
        date: monthStart,
        type: "manual_deduction",
        description: salary?.deduction_reason || "Manual salary deduction",
        amount: -legacyManual,
      });
    }

    const seenForgetCheckoutRows = new Set<string>();

    // Per-transaction manual deductions (e.g. Half Leave approvals, Partial Leave auto, Forget-checkout auto)
    for (const d of manualDeductionsList) {
      const src = d.source || "manual";
      if (src === "auto_early_out") {
        const deductionDate = getForgetCheckoutDate(d.title, d.created_at);
        const dedupeKey = `${deductionDate}-${Number(d.amount) || 0}`;
        if (seenForgetCheckoutRows.has(dedupeKey)) continue;
        seenForgetCheckoutRows.add(dedupeKey);

        items.push({
          id: `auto-forget-checkout-${d.id}`,
          date: deductionDate,
          type: "auto_deduction",
          description: `Forget to Check out (${deductionDate})`,
          amount: -(Number(d.amount) || 0),
        });
        continue;
      }
      if (src === "partial_leave") {
        items.push({
          id: `auto-partial-${d.id}`,
          date: getMMTDateISO(d.created_at),
          type: "auto_deduction",
          description: d.title,
          amount: -(Number(d.amount) || 0),
        });
        continue;
      }

      items.push({
        id: `smd-${d.id}`,
        date: getMMTDateISO(d.created_at),
        type: "manual_deduction",
        description: d.title,
        amount: -(Number(d.amount) || 0),
      });
    }


    // Informational rows for manual leave-day deductions (not a money amount)
    for (const md of manualLeaveDeductions) {
      items.push({
        id: `md-${md.id}`,
        date: md.created_at ? getMMTDateISO(md.created_at) : monthStart,
        type: "manual_deduction",
        description: `${md.title}${md.reason ? ` — ${md.reason}` : ""} (${md.days} day${md.days > 1 ? "s" : ""} leave)`,
        amount: 0,
      });
    }

    return items.sort((a, b) => {
      const dateSort = a.date.localeCompare(b.date);
      if (dateSort !== 0) return dateSort;

      const typeSort = LEDGER_TYPE_ORDER[a.type] - LEDGER_TYPE_ORDER[b.type];
      if (typeSort !== 0) return typeSort;

      return a.description.localeCompare(b.description);
    });
  }, [baseSalary, totalBonus, manualDeductionAmt, salary?.deduction_reason, salary?.manual_deduction, salary?.last_updated, manualLeaveDeductions, manualDeductionsList, attendanceRows, approvedLeaves, rates, bonusTxs, manualAdditions]);


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

      {isStaff && !isNeutralClass && (
        <YearlyBonusSection baseSalary={baseSalary} />
      )}


      <section className="relative z-10 rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="min-w-0 rounded-lg border border-border bg-background px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Base Salary</span>
            </div>
            <p className="text-lg font-bold font-display leading-tight break-words">
              {baseSalary.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
          </div>

          <div className="min-w-0 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="h-4 w-4 text-accent shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Bonus (Earned)</span>
            </div>
            <p className="text-lg font-bold font-display text-accent leading-tight break-words">
              +{totalBonus.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
            {perUnitBonus > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground break-words">
                {earnedUnits}/4 Units · {perUnitBonus.toLocaleString()} per unit
              </p>
            )}
          </div>

          <div className="min-w-0 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Additions</span>
            </div>
            <p className="text-lg font-bold font-display text-primary leading-tight break-words">
              +{totalAdditions.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground break-words">
              Auto: {autoAdditions.toLocaleString()} · Manual: {manualAddTotal.toLocaleString()}
            </p>
          </div>

          <div className="min-w-0 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Deductions</span>
            </div>
            <p className="text-lg font-bold font-display text-destructive leading-tight break-words">
              -{totalDeductions.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground break-words">
              Auto: {totalAutoDeductions.toLocaleString()} · Manual: {manualDeductionAmt.toLocaleString()}
            </p>
          </div>

          <div className="min-w-0 rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-secondary shrink-0" />
              <span className="text-xs font-medium text-muted-foreground">Final Salary</span>
            </div>
            <p className={`text-lg font-bold font-display leading-tight break-words ${finalSalary < 0 ? "text-destructive" : "text-secondary"}`}>
              {finalSalary.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span>
            </p>
          </div>
        </div>
      </section>

      {monthlyBonusPot > 0 && (
        <Card className="border border-accent/30 shadow-none bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="h-4 w-4 text-accent shrink-0" />
              <p className="text-[11px] uppercase tracking-wide text-accent font-semibold">
                Monthly Bonus Plan
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <div className="flex items-baseline gap-1">
                <span className="font-semibold text-foreground">{monthlyBonusPot.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground">Total Pot (Ks)</span>
              </div>
              <span className="text-muted-foreground">÷ 4 =</span>
              <div className="flex items-baseline gap-1">
                <span className="font-semibold text-foreground">{perUnitBonus.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground">per Unit</span>
              </div>
              <span className="text-muted-foreground">·</span>
              <div className="flex items-baseline gap-1">
                <span className="font-semibold text-accent">{earnedUnits}/4</span>
                <span className="text-[10px] text-muted-foreground">Units Earned</span>
              </div>
              <span className="text-muted-foreground">→</span>
              <div className="flex items-baseline gap-1">
                <span className="font-semibold text-accent">+{totalBonus.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground">Bonus (Ks)</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Final Salary သည် Deadline ည MMT စစ်ဆေးပြီး Credit ဝင်ထားသော Unit အရေအတွက်အလိုက်သာ တိုးလာပါမည်။
            </p>
          </CardContent>
        </Card>
      )}

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
            <span className={`font-bold ${finalSalary < 0 ? "text-destructive" : "text-secondary"}`}>{finalSalary.toLocaleString()}</span>
            <span className="text-[10px] text-muted-foreground">Final Ks</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base font-display">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {ledger.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
              <div className="grid grid-cols-[68px,minmax(0,1fr),96px] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid-cols-[72px,minmax(0,1fr),auto]">
                <span>Day</span>
                <span>Description</span>
                <span className="text-right">Amount</span>
              </div>
              <ul className="divide-y divide-border">
              {ledger.map((e) => {
                const meta = TYPE_META[e.type];
                const dayNumber = e.date ? Number(e.date.slice(8, 10)) : 0;
                const isCredit = e.amount > 0;

                return (
                  <li key={e.id} className="grid grid-cols-[68px,minmax(0,1fr),96px] items-start gap-3 px-3 py-3 sm:grid-cols-[72px,minmax(0,1fr),auto]">
                    <div className="pt-0.5 text-sm font-semibold text-foreground">
                      Day {dayNumber}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted">
                        {meta.label}
                      </div>
                      <p className="text-sm font-medium text-foreground break-words">{e.description}</p>
                    </div>
                    <div className="pt-0.5 text-right min-w-0 shrink-0">
                      {e.amount === 0 ? (
                        <span className="text-sm font-semibold text-foreground/70">
                          0 <span className="text-[10px] font-normal">MMK</span>
                        </span>
                      ) : (
                        <span className={`text-sm font-semibold ${isCredit ? "text-accent" : "text-destructive"}`}>
                          {isCredit ? "+" : "-"}
                          {Math.abs(e.amount).toLocaleString()} <span className="text-[10px] font-normal">MMK</span>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              </ul>
              <div className="grid grid-cols-[68px,minmax(0,1fr),96px] items-center gap-3 border-t-2 border-border bg-muted/50 px-3 py-4 sm:grid-cols-[72px,minmax(0,1fr),auto]">
                <div className="text-sm font-semibold text-muted-foreground">Final</div>
                <div className="text-sm font-semibold text-foreground">Final Salary</div>
                <div className={`text-right text-base font-bold font-display ${finalSalary < 0 ? "text-destructive" : "text-secondary"}`}>
                  {finalSalary.toLocaleString()} MMK
                </div>
              </div>
              {slipActive && isStaff && (
                <div className="border-t border-border bg-background px-3 py-3 flex justify-end">
                  <Button size="sm" onClick={() => setSignOpen(true)} className="gap-1">
                    <PenLine className="h-3 w-3" /> Sign and Download
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SignatureSlipDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        staffName={profile?.full_name || "Staff"}
        monthStartISO={getMonthStart()}
        baseSalary={baseSalary}
        totalBonus={totalBonus}
        totalAdditions={totalAdditions}
        totalDeductions={totalDeductions}
        finalSalary={finalSalary}
        ledger={ledger.map(l => ({ date: l.date, type: l.type, description: l.description, amount: l.amount }))}
      />
    </div>
  );
}

