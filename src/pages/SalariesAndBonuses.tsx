import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Wallet, TrendingDown, DollarSign, Sparkles, Pencil, Plus, Minus, Trash2, PenLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSlipSetting } from "@/hooks/useAppSettingsCache";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { formatMMTDate, formatMMTDateTime, formatMMTMonthLabel, getMMTMonthStartISO, getMMTMonthEndISO, getMMTTodayISO } from "@/lib/mmt";

interface StaffRow {
  id: string;
  full_name: string;
  base_salary: number;
  avatar_url?: string | null;
}

interface SalaryRecord {
  user_id: string;
  base_salary: number;
  current_salary: number;
  total_deductions: number;
  bonus: number;
  manual_deduction: number;
  deduction_reason: string;
}

interface ManualAddition {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  created_at: string;
  effective_date?: string | null;
  kind?: string;
}

function getMonthStart(): string {
  return getMMTMonthStartISO();
}

export default function SalariesAndBonuses() {
  const { user } = useAuth();
  const { isAdmin, profile } = useProfile();
  const isAdminRole = profile?.role === "admin";
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [salaryMap, setSalaryMap] = useState<Record<string, SalaryRecord>>({});
  const [bonusEarnedMap, setBonusEarnedMap] = useState<Record<string, number>>({});
  const [additionsMap, setAdditionsMap] = useState<Record<string, ManualAddition[]>>({});
  const [autoDeductMap, setAutoDeductMap] = useState<Record<string, number>>({});
  const [manualDeductExtraMap, setManualDeductExtraMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ bonus: "0", manual_deduction: "0", deduction_reason: "" });
  const [saving, setSaving] = useState(false);

  // Manual Addition dialog
  const [addOpenFor, setAddOpenFor] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ title: "", amount: "", date: getMMTTodayISO() });
  const [addSaving, setAddSaving] = useState(false);

  // Manual Deduction dialog (per-transaction, dated)
  const [dedOpenFor, setDedOpenFor] = useState<string | null>(null);
  const [dedForm, setDedForm] = useState({ title: "", amount: "", date: getMMTTodayISO() });
  const [dedSaving, setDedSaving] = useState(false);

  // Slip signing toggle
  const { slipEnabled, slipUntil, refreshSlipSetting, setSlipSetting } = useSlipSetting();
  const [slipSaving, setSlipSaving] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  // Tick once a minute to auto-hide toggle status after MMT 23:59:59
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const slipActive = slipEnabled && !!slipUntil && nowMs < Date.parse(slipUntil);

  // Phase 2B-1: Realtime events while the tab is hidden only mark a pending
  // refresh; exactly one reload runs when the tab becomes visible again.
  const triggerLoad = useVisibleRefresh(() => load(true));
  const triggerSlip = useVisibleRefresh(() => refreshSlipSetting());

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel("admin-salaries-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "salaries" }, () => triggerLoad())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => triggerLoad())
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_manual_deductions" }, () => triggerLoad())
      .on("postgres_changes", { event: "*", schema: "public", table: "salary_manual_additions" }, () => triggerLoad())
      .on("postgres_changes", { event: "*", schema: "public", table: "bonus_transactions" }, () => triggerLoad())
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => triggerLoad())
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => triggerSlip())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);



  // Returns the UTC ISO string for today's MMT 23:59:59
  const computeMMTEndOfDayISO = () => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Yangon",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === "year")!.value;
    const m = parts.find(p => p.type === "month")!.value;
    const d = parts.find(p => p.type === "day")!.value;
    // MMT 23:59:59.999 = UTC 17:29:59.999
    return `${y}-${m}-${d}T17:29:59.999Z`;
  };

  const toggleSlip = async (next: boolean) => {
    if (!isAdminRole) return;
    setSlipSaving(true);
    const until = next ? computeMMTEndOfDayISO() : (slipUntil || computeMMTEndOfDayISO());
    const rows = [
      { key: "slip_signing_enabled", value: next ? "true" : "false" },
      { key: "slip_signing_enabled_until", value: until },
    ];
    const { error } = await (supabase as any).from("app_settings").upsert(rows, { onConflict: "key" });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      setSlipSetting({ enabled: next, until });
      toast({
        title: next ? "Sign & Download enabled" : "Sign & Download disabled",
        description: next ? "Staff နိုင်ပါပြီ ၊ ညနေ ၁၁:၅၉ PM MMT တွင် Auto Off ဖြစ်မည်" : undefined,
      });
    }
    setSlipSaving(false);
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);

    const monthStart = getMonthStart();
    const [profilesRes, salariesRes, bonusTxRes, additionsRes, attRes, leavesRes, smdRes] = await Promise.all([
      supabase.rpc("admin_list_profiles"),
      supabase.from("salaries").select("*").eq("month", monthStart),
      supabase.from("bonus_transactions").select("user_id, amount").eq("month", monthStart),
      supabase.from("salary_manual_additions").select("*").eq("month", monthStart).order("created_at", { ascending: false }),
      supabase.from("attendance").select("user_id, date, late_minutes, early_minutes").gte("date", monthStart),
      supabase.from("leave_requests").select("user_id, date, type, payment_type, status").eq("status", "approved").gte("date", monthStart),
      (supabase as any).from("salary_manual_deductions").select("user_id, amount, source").eq("month", monthStart),
    ]);
    const profilesData = (profilesRes.data as any[]) || [];
    const rateMap: Record<string, { late: number; early: number }> = {};
    for (const p of profilesData) {
      const legacy = Number(p.deduction_rate_per_minute) || 200;
      rateMap[p.id] = {
        late: Number(p.late_deduction_per_minute) || legacy,
        early: Number(p.early_deduction_per_minute) || legacy,
      };
    }
    const filtered = profilesData.filter((p) => p.role !== "it_manager" && p.role !== "admin" && p.id !== user?.id);
    setStaff(filtered as StaffRow[]);

    if (salariesRes.data) {
      const map: Record<string, SalaryRecord> = {};
      (salariesRes.data as unknown as SalaryRecord[]).forEach((s) => { map[s.user_id] = s; });
      setSalaryMap(map);
    }
    if (bonusTxRes.data) {
      const earned: Record<string, number> = {};
      (bonusTxRes.data as any[]).forEach((b) => {
        earned[b.user_id] = (earned[b.user_id] || 0) + (Number(b.amount) || 0);
      });
      setBonusEarnedMap(earned);
    }
    if (additionsRes.data) {
      const map: Record<string, ManualAddition[]> = {};
      (additionsRes.data as any[]).forEach((a) => {
        (map[a.user_id] ??= []).push(a as ManualAddition);
      });
      setAdditionsMap(map);
    }

    // Live auto-deduction from attendance × per-min rates, with paid-leave excuses
    const leavesByUserDate = new Map<string, Set<string>>();
    for (const l of (leavesRes.data as any[]) || []) {
      if ((l.payment_type ?? "paid") !== "paid") continue;
      const k = `${l.user_id}|${l.date}`;
      const set = leavesByUserDate.get(k) ?? new Set<string>();
      set.add(l.type);
      leavesByUserDate.set(k, set);
    }
    const autoMap: Record<string, number> = {};
    for (const a of (attRes.data as any[]) || []) {
      const r = rateMap[a.user_id] || { late: 200, early: 200 };
      const excuses = leavesByUserDate.get(`${a.user_id}|${a.date}`) ?? new Set<string>();
      const earlyExcused = excuses.has("leave") || excuses.has("partial_leave");
      const lateAmt = (a.late_minutes ?? 0) * r.late;
      const earlyAmt = earlyExcused ? 0 : (a.early_minutes ?? 0) * r.early;
      autoMap[a.user_id] = (autoMap[a.user_id] || 0) + lateAmt + earlyAmt;
    }
    // Add auto-source manual_deductions (partial_leave, auto_early_out) to auto bucket; rest to manual extras
    const manExtra: Record<string, number> = {};
    for (const d of (smdRes as any).data || []) {
      const src = d.source || "manual";
      const amt = Number(d.amount) || 0;
      if (src === "auto_early_out" || src === "partial_leave") {
        autoMap[d.user_id] = (autoMap[d.user_id] || 0) + amt;
      } else {
        manExtra[d.user_id] = (manExtra[d.user_id] || 0) + amt;
      }
    }
    setAutoDeductMap(autoMap);
    setManualDeductExtraMap(manExtra);
    setLoading(false);
  };


  const additionTotal = (uid: string, kind?: "manual" | "auto") =>
    (additionsMap[uid] || [])
      .filter((a) => (kind ? (a.kind || "manual") === kind : true))
      .reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const openEdit = (member: StaffRow) => {
    if (!isAdminRole) return;
    const sal = salaryMap[member.id];
    setEditId(member.id);
    setForm({
      bonus: String(sal?.bonus ?? 0),
      manual_deduction: String(sal?.manual_deduction ?? 0),
      deduction_reason: sal?.deduction_reason ?? "",
    });
  };

  const handleSave = async () => {
    if (!editId) return;
    const member = staff.find((s) => s.id === editId);
    if (!member) return;
    setSaving(true);
    const monthStart = getMonthStart();
    const existing = salaryMap[editId];
    const baseSalary = existing?.base_salary ?? member.base_salary;
    const autoDeductions = existing?.total_deductions ?? 0;
    const bonus = Number(form.bonus) || 0;
    const manualDeduction = Number(form.manual_deduction) || 0;
    const current = Math.max(0, baseSalary + bonus - autoDeductions - manualDeduction);
    const payload: any = {
      user_id: editId,
      month: monthStart,
      base_salary: baseSalary,
      bonus,
      manual_deduction: manualDeduction,
      deduction_reason: form.deduction_reason,
      total_deductions: autoDeductions,
      current_salary: current,
      last_updated: new Date().toISOString(),
    };
    const res = existing
      ? await supabase.from("salaries").update(payload).eq("user_id", editId).eq("month", monthStart)
      : await supabase.from("salaries").insert(payload);
    if (res.error) {
      toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: `Updated salary for ${member.full_name}.` });
      setEditId(null);
      load();
    }
    setSaving(false);
  };

  const monthMin = getMMTMonthStartISO();
  const monthMax = getMMTMonthEndISO();
  const inCurrentMonth = (d: string) => !!d && d >= monthMin && d <= monthMax;

  const openAdd = (memberId: string) => {
    if (!isAdminRole) return;
    setAddOpenFor(memberId);
    setAddForm({ title: "", amount: "", date: getMMTTodayISO() });
  };

  const openDeduct = (memberId: string) => {
    if (!isAdminRole) return;
    setDedOpenFor(memberId);
    setDedForm({ title: "", amount: "", date: getMMTTodayISO() });
  };

  const handleAdd = async () => {
    if (!addOpenFor || !user) return;
    const amt = Number(addForm.amount);
    if (!addForm.title.trim() || !Number.isFinite(amt) || amt <= 0 || !inCurrentMonth(addForm.date)) {
      toast({ title: "Invalid input", description: "Enter a description, a positive amount and a date inside this month.", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    const { error } = await supabase.from("salary_manual_additions").insert({
      user_id: addOpenFor,
      month: getMonthStart(),
      title: addForm.title.trim(),
      amount: Math.round(amt),
      created_by: user.id,
      effective_date: addForm.date,
    } as any);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Added +${Math.round(amt).toLocaleString()} Ks` });
      setAddOpenFor(null);
      load();
    }
    setAddSaving(false);
  };

  const handleDeduct = async () => {
    if (!dedOpenFor || !user) return;
    const amt = Number(dedForm.amount);
    if (!dedForm.title.trim() || !Number.isFinite(amt) || amt <= 0 || !inCurrentMonth(dedForm.date)) {
      toast({ title: "Invalid input", description: "Enter a description, a positive amount and a date inside this month.", variant: "destructive" });
      return;
    }
    setDedSaving(true);
    const { error } = await (supabase as any).from("salary_manual_deductions").insert({
      user_id: dedOpenFor,
      month: getMonthStart(),
      title: dedForm.title.trim(),
      amount: Math.round(amt),
      source: "manual",
      created_by: user.id,
      effective_date: dedForm.date,
    });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Deducted -${Math.round(amt).toLocaleString()} Ks` });
      setDedOpenFor(null);
      load();
    }
    setDedSaving(false);
  };


  const removeAddition = async (id: string, amount: number) => {
    const { error } = await supabase.from("salary_manual_additions").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Addition removed (-${amount.toLocaleString()} Ks)` });
      load();
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-display">Salaries &amp; Bonuses</h1>
        <p className="text-muted-foreground text-sm">You do not have access to this page.</p>
      </div>
    );
  }

  const currentMonth = formatMMTMonthLabel(new Date());

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-display">Salaries &amp; Bonuses</h1>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totals = staff.reduce(
    (acc, m) => {
      const sal = salaryMap[m.id];
      const base = sal?.base_salary ?? m.base_salary;
      const bonus = bonusEarnedMap[m.id] ?? 0;
      const autoAdd = additionTotal(m.id, "auto");
      const manualAdd = additionTotal(m.id, "manual");
      const auto = autoDeductMap[m.id] ?? 0;
      const manual = (sal?.manual_deduction ?? 0) + (manualDeductExtraMap[m.id] ?? 0);

      const final = base + bonus + autoAdd + manualAdd - auto - manual;
      acc.base += base;
      acc.bonus += bonus;
      acc.deductions += auto + manual;
      acc.final += final;
      return acc;
    },
    { base: 0, bonus: 0, deductions: 0, final: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display">Salaries &amp; Bonuses</h1>
          <p className="text-muted-foreground text-sm mt-1">{staff.length} staff · {currentMonth}</p>
        </div>
        {isAdminRole && (
          <div className="rounded-lg border border-border bg-card px-3 py-2 flex items-start gap-3 max-w-xs">
            <PenLine className="h-4 w-4 text-primary mt-1 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Switch checked={slipActive} onCheckedChange={toggleSlip} disabled={slipSaving} />
                <span className="text-xs font-semibold">{slipActive ? "ON" : "OFF"}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                Allow Staff to Sign and Download Salary &amp; Bonus Slips
              </p>
              {slipActive && slipUntil && (
                <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                  Auto-off: 11:59 PM MMT
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Aggregate summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border border-border shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total Base</span></div>
            <p className="text-lg font-bold font-display">{totals.base.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span></p>
          </CardContent>
        </Card>
        <Card className="border border-accent/30 bg-accent/5 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Sparkles className="h-4 w-4 text-accent" /><span className="text-xs text-muted-foreground">Total Bonus</span></div>
            <p className="text-lg font-bold font-display text-accent">+{totals.bonus.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span></p>
          </CardContent>
        </Card>
        <Card className="border border-destructive/30 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><TrendingDown className="h-4 w-4 text-destructive" /><span className="text-xs text-muted-foreground">Total Deductions</span></div>
            <p className="text-lg font-bold font-display text-destructive">-{totals.deductions.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span></p>
          </CardContent>
        </Card>
        <Card className="border border-primary/30 bg-primary/5 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-primary" /><span className="text-xs text-muted-foreground">Total Payable</span></div>
            <p className="text-lg font-bold font-display text-primary">{totals.final.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">Ks</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Per-staff salary preview */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-display">Per-Staff Salary Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {staff.length === 0 && (
            <p className="text-sm text-muted-foreground">No staff members yet.</p>
          )}
          {staff.map((m) => {
            const sal = salaryMap[m.id];
            const base = sal?.base_salary ?? m.base_salary;
            const pot = sal?.bonus ?? 0;
            const bonus = bonusEarnedMap[m.id] ?? 0;
            const auto = autoDeductMap[m.id] ?? 0;
            const manual = (sal?.manual_deduction ?? 0) + (manualDeductExtraMap[m.id] ?? 0);

            const autoAdd = additionTotal(m.id, "auto");
            const manualAdd = additionTotal(m.id, "manual");
            const additions = additionsMap[m.id] || [];
            const final = base + bonus + autoAdd + manualAdd - auto - manual;
            return (
              <div key={m.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold overflow-hidden shrink-0">
                      {m.avatar_url ? <img src={m.avatar_url} alt={m.full_name} className="h-full w-full object-cover" /> : m.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <p className="font-semibold text-sm truncate">{m.full_name || "Unnamed"}</p>
                  </div>
                  {isAdminRole && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(m)} className="gap-1">
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
                  <div className="rounded bg-muted/40 p-2">
                    <p className="text-muted-foreground">Base Salary</p>
                    <p className="font-semibold">{base.toLocaleString()}</p>
                  </div>
                  <div className="rounded bg-accent/10 p-2">
                    <p className="text-muted-foreground">+ Bonus (earned)</p>
                    <p className="font-semibold text-accent">+{bonus.toLocaleString()}<span className="text-[10px] text-muted-foreground"> / {pot.toLocaleString()}</span></p>
                  </div>
                  <div className="rounded bg-accent/10 p-2">
                    <p className="text-muted-foreground">+ Auto Addition</p>
                    <p className="font-semibold text-accent">+{autoAdd.toLocaleString()}</p>
                  </div>
                  <div className="rounded bg-destructive/10 p-2">
                    <p className="text-muted-foreground">- Auto Deduction</p>
                    <p className="font-semibold text-destructive">-{auto.toLocaleString()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => isAdminRole && openAdd(m.id)}
                    className="rounded bg-accent/10 p-2 text-left hover:bg-accent/20 transition-colors disabled:opacity-60"
                    disabled={!isAdminRole}
                    title={isAdminRole ? "Add manual addition" : ""}
                  >
                    <p className="text-muted-foreground flex items-center gap-1">+ Manual Addition {isAdminRole && <Plus className="h-3 w-3" />}</p>
                    <p className="font-semibold text-accent">+{manualAdd.toLocaleString()}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => isAdminRole && openDeduct(m.id)}
                    className="rounded bg-destructive/10 p-2 text-left hover:bg-destructive/20 transition-colors disabled:opacity-60"
                    disabled={!isAdminRole}
                    title={isAdminRole ? "Add manual deduction" : ""}
                  >
                    <p className="text-muted-foreground flex items-center gap-1">- Manual Deduction {isAdminRole && <Minus className="h-3 w-3" />}</p>
                    <p className="font-semibold text-destructive">-{manual.toLocaleString()}</p>
                  </button>
                  <div className="rounded bg-primary/10 p-2">
                    <p className="text-muted-foreground">Final Salary</p>
                    <p className="font-bold text-primary">{final.toLocaleString()}</p>
                  </div>
                </div>
                {additions.length > 0 && (
                  <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Additions</p>
                    {additions.map((a) => {
                      const isAuto = (a.kind || "manual") === "auto";
                      return (
                        <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              <Badge variant="secondary" className={`text-[9px] mr-1 ${isAuto ? "bg-primary/15 text-primary" : ""}`}>
                                {isAuto ? "AUTO" : "MANUAL"}
                              </Badge>
                              {a.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {a.effective_date ? formatMMTDate(`${a.effective_date}T00:00:00+06:30`) : formatMMTDateTime(a.created_at)}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">+{a.amount.toLocaleString()} Ks</Badge>
                          {isAdminRole && !isAuto && (
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeAddition(a.id, a.amount)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {sal?.deduction_reason && (
                  <p className="text-[11px] text-muted-foreground">Reason: {sal.deduction_reason}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={(v) => { if (!v) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Edit Bonus &amp; Manual Deduction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Bonus (kyats)</Label>
              <Input type="number" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">
                Adds to this month's final salary. Split into <b>4 units</b>: per-unit ={" "}
                <b>{Math.floor((Number(form.bonus) || 0) / 4).toLocaleString()} Ks</b>.
                Each approved task (weekly = 1 unit, bi-weekly = 2 units) credits that share.
              </p>
            </div>
            <div>
              <Label>Manual Deduction (kyats)</Label>
              <Input type="number" value={form.manual_deduction} onChange={(e) => setForm({ ...form, manual_deduction: e.target.value })} />
            </div>
            <div>
              <Label>Deduction Reason</Label>
              <Input value={form.deduction_reason} onChange={(e) => setForm({ ...form, deduction_reason: e.target.value })} placeholder="e.g. Equipment damage" />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Addition dialog */}
      <Dialog open={!!addOpenFor} onOpenChange={(v) => { if (!v) setAddOpenFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Manual Salary Addition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Description</Label>
              <Input value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} placeholder="e.g. Special allowance" />
            </div>
            <div>
              <Label>Amount (kyats)</Label>
              <Input type="number" min={1} value={addForm.amount} onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Date (this month)</Label>
              <Input
                type="date"
                value={addForm.date}
                min={monthMin}
                max={monthMax}
                onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Appears on this date in the staff member's Transaction History. Cleared with the monthly reset.
              </p>
            </div>
            <Button onClick={handleAdd} disabled={addSaving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {addSaving ? "Adding..." : "Add to Salary"}
            </Button>

          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Deduction dialog */}
      <Dialog open={!!dedOpenFor} onOpenChange={(v) => { if (!v) setDedOpenFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Manual Salary Deduction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Description</Label>
              <Input value={dedForm.title} onChange={(e) => setDedForm({ ...dedForm, title: e.target.value })} placeholder="e.g. Excess leave deduction" />
            </div>
            <div>
              <Label>Amount (kyats)</Label>
              <Input type="number" min={1} value={dedForm.amount} onChange={(e) => setDedForm({ ...dedForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Date (this month)</Label>
              <Input
                type="date"
                value={dedForm.date}
                min={monthMin}
                max={monthMax}
                onChange={(e) => setDedForm({ ...dedForm, date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Appears on this date in the staff member's Transaction History. Cleared with the monthly reset.
              </p>
            </div>
            <Button onClick={handleDeduct} disabled={dedSaving} className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {dedSaving ? "Saving..." : "Apply Deduction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
