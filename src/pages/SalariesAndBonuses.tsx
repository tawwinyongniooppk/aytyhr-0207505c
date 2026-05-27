import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, TrendingDown, DollarSign, Sparkles, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";

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

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function SalariesAndBonuses() {
  const { user } = useAuth();
  const { isAdmin, profile } = useProfile();
  const isAdminRole = profile?.role === "admin";
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [salaryMap, setSalaryMap] = useState<Record<string, SalaryRecord>>({});
  const [bonusEarnedMap, setBonusEarnedMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ bonus: "0", manual_deduction: "0", deduction_reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const monthStart = getMonthStart();
    const [profilesRes, salariesRes, bonusTxRes] = await Promise.all([
      supabase.rpc("admin_list_profiles"),
      supabase.from("salaries").select("*").eq("month", monthStart),
      supabase.from("bonus_transactions").select("user_id, amount").eq("month", monthStart),
    ]);
    if (profilesRes.data) {
      const filtered = (profilesRes.data as any[]).filter(
        (p) => p.role !== "it_manager" && p.role !== "admin" && p.id !== user?.id
      );
      setStaff(filtered as StaffRow[]);
    }
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
    setLoading(false);
  };

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

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold font-display">Salaries &amp; Bonuses</h1>
        <p className="text-muted-foreground text-sm">You do not have access to this page.</p>
      </div>
    );
  }

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

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

  // Aggregate stats — bonus uses earned (sum of bonus_transactions), not the monthly pot.
  const totals = staff.reduce(
    (acc, m) => {
      const sal = salaryMap[m.id];
      const base = sal?.base_salary ?? m.base_salary;
      const bonus = bonusEarnedMap[m.id] ?? 0;
      const auto = sal?.total_deductions ?? 0;
      const manual = sal?.manual_deduction ?? 0;
      const final = Math.max(0, base + bonus - auto - manual);
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
      <div>
        <h1 className="text-2xl font-bold font-display">Salaries &amp; Bonuses</h1>
        <p className="text-muted-foreground text-sm mt-1">{staff.length} staff · {currentMonth}</p>
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
            const auto = sal?.total_deductions ?? 0;
            const manual = sal?.manual_deduction ?? 0;
            const final = Math.max(0, base + bonus - auto - manual);
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
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="rounded bg-muted/40 p-2">
                    <p className="text-muted-foreground">Base</p>
                    <p className="font-semibold">{base.toLocaleString()}</p>
                  </div>
                  <div className="rounded bg-accent/10 p-2">
                    <p className="text-muted-foreground">+ Bonus (earned)</p>
                    <p className="font-semibold text-accent">+{bonus.toLocaleString()}<span className="text-[10px] text-muted-foreground"> / {pot.toLocaleString()}</span></p>
                  </div>
                  <div className="rounded bg-destructive/10 p-2">
                    <p className="text-muted-foreground">- Auto</p>
                    <p className="font-semibold text-destructive">-{auto.toLocaleString()}</p>
                  </div>
                  <div className="rounded bg-destructive/10 p-2">
                    <p className="text-muted-foreground">- Manual</p>
                    <p className="font-semibold text-destructive">-{manual.toLocaleString()}</p>
                  </div>
                  <div className="rounded bg-primary/10 p-2">
                    <p className="text-muted-foreground">Final</p>
                    <p className="font-bold text-primary">{final.toLocaleString()}</p>
                  </div>
                </div>
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
    </div>
  );
}
