import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Phone, Wallet, TrendingDown, DollarSign, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";

interface DaySchedule {
  active: boolean;
  check_in: string;
  check_out: string;
}
type WeekSchedule = Record<string, DaySchedule>;

interface StaffProfile {
  id: string;
  full_name: string;
  role: string;
  base_salary: number;
  phone: string;
  join_date: string;
  check_in_time: string;
  check_out_time: string;
  work_day: string;
  work_schedule?: WeekSchedule | null;
  avatar_url?: string | null;
  sequence?: number;
  deduction_rate_per_minute?: number;
}

const WORK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const defaultSchedule = (): WeekSchedule => {
  const sched: WeekSchedule = {} as WeekSchedule;
  WORK_DAYS.forEach((d) => {
    const weekend = d === "Saturday" || d === "Sunday";
    sched[d] = { active: !weekend, check_in: "09:00", check_out: "16:00" };
  });
  return sched;
};

const normalizeSchedule = (s: any): WeekSchedule => {
  const base = defaultSchedule();
  if (s && typeof s === "object") {
    WORK_DAYS.forEach((d) => {
      if (s[d]) {
        base[d] = {
          active: !!s[d].active,
          check_in: s[d].check_in || "09:00",
          check_out: s[d].check_out || "16:00",
        };
      }
    });
  }
  return base;
};

interface SalaryRecord {
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

export default function Staff() {
  const { user } = useAuth();
  const { isAdmin, canViewSalary, profile: currentProfile } = useProfile();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [salaryMap, setSalaryMap] = useState<Record<string, SalaryRecord>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "", bonus: "0", manual_deduction: "0", deduction_reason: "", deduction_rate_per_minute: "200" });
  const [schedule, setSchedule] = useState<WeekSchedule>(defaultSchedule());
  const [addForm, setAddForm] = useState({ full_name: "", email: "", password: "", role: "staff", base_salary: "300000", phone: "" });
  const [addLoading, setAddLoading] = useState(false);

  const currentUserRole = currentProfile?.role || "";
  const isAdminRole = currentUserRole === "admin";

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const monthStart = getMonthStart();

    const [profilesRes, salariesRes] = await Promise.all([
      supabase.rpc("admin_list_profiles"),
      supabase.from("salaries").select("*").eq("month", monthStart),
    ]);

    if (profilesRes.data) {
      const filtered = (profilesRes.data as unknown as StaffProfile[]).filter(
        p => p.role !== "it_manager" && p.role !== "admin" && p.id !== user?.id
      );
      setStaff(filtered);
    }

    if (salariesRes.data) {
      const map: Record<string, SalaryRecord> = {};
      (salariesRes.data as unknown as (SalaryRecord & { user_id: string })[]).forEach((s) => {
        map[s.user_id] = s;
      });
      setSalaryMap(map);
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!editId) {
      toast({ title: "No staff selected", description: "Please reopen the staff card and try again.", variant: "destructive" });
      return;
    }

    // Derive legacy single-day fields from the first active day for back-compat
    const firstActive = WORK_DAYS.find((d) => schedule[d]?.active) || "Monday";
    const legacyDay = schedule[firstActive] || { active: true, check_in: "09:00", check_out: "16:00" };
    const updateData: any = {
      phone: form.phone,
      join_date: form.join_date || null,
      check_in_time: legacyDay.check_in,
      check_out_time: legacyDay.check_out,
      work_day: firstActive,
      work_schedule: schedule,
    };
    // Only admin can update salary
    if (isAdminRole) {
      updateData.base_salary = Number(form.base_salary) || 300000;
    }

    // Update the specific staff member's profile and verify the row was changed
    const { data: updated, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", editId)
      .select("id, work_schedule, check_in_time, check_out_time, work_day")
      .maybeSingle();

    if (error) {
      console.error("Profile update failed", error);
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    if (!updated) {
      toast({
        title: "Save failed",
        description: "No staff record was updated. You may not have permission to modify this profile.",
        variant: "destructive",
      });
      return;
    }

    // Admin: upsert monthly salary financial fields (bonus, manual deduction, reason)
    if (isAdminRole) {
      const monthStart = getMonthStart();
      const bonus = Number(form.bonus) || 0;
      const manualDeduction = Number(form.manual_deduction) || 0;
      const baseSalary = Number(form.base_salary) || 300000;
      const existing = salaryMap[editId];
      const autoDeductions = existing?.total_deductions ?? 0;
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
      const salRes = existing
        ? await supabase.from("salaries").update(payload).eq("user_id", editId).eq("month", monthStart)
        : await supabase.from("salaries").insert(payload);
      if (salRes.error) {
        console.error("Salary upsert failed", salRes.error);
        toast({
          title: "Schedule saved, salary not updated",
          description: salRes.error.message,
          variant: "destructive",
        });
      }
    }

    // Optimistically reflect the saved schedule on the selected staff card
    setStaff((prev) =>
      prev.map((m) =>
        m.id === editId
          ? {
              ...m,
              phone: updateData.phone,
              join_date: updateData.join_date,
              check_in_time: updateData.check_in_time,
              check_out_time: updateData.check_out_time,
              work_day: updateData.work_day,
              work_schedule: schedule,
              ...(isAdminRole ? { base_salary: updateData.base_salary } : {}),
            }
          : m
      )
    );

    toast({ title: "Saved", description: `Updated schedule for ${form.full_name || "staff member"}.` });

    setForm({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "", bonus: "0", manual_deduction: "0", deduction_reason: "", deduction_rate_per_minute: "200" });
    setSchedule(defaultSchedule());
    setEditId(null);
    setOpen(false);
    loadData();
  };

  const handleAddStaff = async () => {
    if (!addForm.full_name || !addForm.email || !addForm.password) {
      toast({ title: "Missing fields", description: "Name, email, and password are required.", variant: "destructive" });
      return;
    }
    if (addForm.password.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters required.", variant: "destructive" });
      return;
    }
    setAddLoading(true);
    try {
      const res = await supabase.functions.invoke("create-staff", {
        body: {
          email: addForm.email,
          password: addForm.password,
          full_name: addForm.full_name,
          role: addForm.role,
          base_salary: Number(addForm.base_salary) || 300000,
          phone: addForm.phone,
        },
      });

      if (res.error) {
        toast({ title: "Failed to create staff", description: res.error.message, variant: "destructive" });
      } else if (res.data?.error) {
        toast({ title: "Failed to create staff", description: res.data.error, variant: "destructive" });
      } else {
        toast({ title: "Account created!", description: `${addForm.full_name} can now log in.` });
        setAddOpen(false);
        setAddForm({ full_name: "", email: "", password: "", role: "staff", base_salary: "300000", phone: "" });
        loadData();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setAddLoading(false);
  };

  const openEdit = (member: StaffProfile) => {
    setEditId(member.id);
    const sal = salaryMap[member.id];
    setForm({
      full_name: member.full_name,
      role: member.role,
      base_salary: String(member.base_salary),
      phone: member.phone || "",
      join_date: member.join_date || "",
      bonus: String(sal?.bonus ?? 0),
      manual_deduction: String(sal?.manual_deduction ?? 0),
      deduction_reason: sal?.deduction_reason ?? "",
    });
    setSchedule(normalizeSchedule(member.work_schedule));
    setOpen(true);
  };

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold font-display">Staff</h1></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Staff</h1>
          <p className="text-muted-foreground text-sm mt-1">{staff.length} members · {currentMonth}</p>
        </div>
        {/* Account creation moved to IT Manager */}
      </div>

      {/* Staff Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((member) => {
          const sal = salaryMap[member.id];
          const baseSalary = sal?.base_salary ?? member.base_salary;
          const totalDeductions = sal?.total_deductions ?? 0;
          const remaining = sal?.current_salary ?? baseSalary;
          const hasDeductions = totalDeductions > 0;

          return (
            <Card
              key={member.id}
              className="border border-border shadow-sm cursor-pointer hover:shadow-md hover:border-primary/30 transition-all duration-200"
              onClick={() => isAdmin && openEdit(member)}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0 overflow-hidden">
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt={member.full_name} className="h-full w-full object-cover" />
                    ) : (
                      member.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{member.full_name || "Unnamed"}</h3>
                    {member.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Phone className="h-3 w-3" />{member.phone}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs border-t border-border pt-2 space-y-1">
                  {(() => {
                    const sched = normalizeSchedule(member.work_schedule);
                    return WORK_DAYS.map((d) => {
                      const day = sched[d];
                      return (
                        <div
                          key={d}
                          className={`flex justify-between items-center px-2 py-1 rounded ${
                            day.active
                              ? "bg-accent/10 text-accent-foreground"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          <span className="font-medium">{d.slice(0, 3)}</span>
                          <span>
                            {day.active ? `${day.check_in} – ${day.check_out}` : "Off"}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Only show salary info to admin */}
                {canViewSalary && (
                  <div className="border-t border-border pt-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" /> Base
                      </span>
                      <span className="font-medium">{baseSalary.toLocaleString()} kyats</span>
                    </div>
                    {hasDeductions && (
                      <div className="flex justify-between text-xs">
                        <span className="text-destructive flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" /> Deductions
                        </span>
                        <span className="font-medium text-destructive">-{totalDeductions.toLocaleString()} kyats</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm pt-1 border-t border-border">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5 text-primary" /> Remaining
                      </span>
                      <span className="font-bold text-primary">{remaining.toLocaleString()} kyats</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full ${hasDeductions ? "bg-destructive" : "bg-accent"}`} />
                  <span className="text-xs text-muted-foreground">
                    {hasDeductions ? "Has deductions" : "On track"}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "", bonus: "0", manual_deduction: "0", deduction_reason: "" }); setSchedule(defaultSchedule()); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Full Name</Label>
              <Input value={form.full_name} disabled readOnly />
              <p className="text-xs text-muted-foreground mt-1">Only the IT Manager can change the staff name.</p>
            </div>
            <div>
              <Label>Role</Label>
              <Input value={form.role.replace("_", " ")} disabled className="capitalize" />
              <p className="text-xs text-muted-foreground mt-1">Only the IT Manager can change roles.</p>
            </div>
            {/* Only admin can see/edit salary */}
            {isAdminRole && (
              <div>
                <Label>Base Salary (kyats/month)</Label>
                <Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} />
              </div>
            )}
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Join Date</Label>
              <Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} />
            </div>
            <div className="space-y-2 border-t border-border pt-3">
              <Label>Weekly Schedule</Label>
              <p className="text-xs text-muted-foreground">Toggle each day on/off and set check-in / check-out times.</p>
              <div className="space-y-2">
                {WORK_DAYS.map((d) => {
                  const day = schedule[d];
                  const active = day.active;
                  return (
                    <div
                      key={d}
                      className={`rounded-lg border p-3 transition-colors ${
                        active
                          ? "border-accent/40 bg-accent/10"
                          : "border-destructive/40 bg-destructive/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={active}
                            onCheckedChange={(v) =>
                              setSchedule({ ...schedule, [d]: { ...day, active: v } })
                            }
                          />
                          <span className={`text-sm font-medium ${active ? "text-accent-foreground" : "text-destructive"}`}>{d}</span>
                          <span className={`text-[10px] uppercase font-semibold ${active ? "text-accent" : "text-destructive"}`}>
                            {active ? "Active" : "Off"}
                          </span>
                        </div>
                      </div>
                      {active && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <Label className="text-xs">Check-in</Label>
                            <Input
                              type="time"
                              value={day.check_in}
                              onChange={(e) =>
                                setSchedule({ ...schedule, [d]: { ...day, check_in: e.target.value } })
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Check-out</Label>
                            <Input
                              type="time"
                              value={day.check_out}
                              onChange={(e) =>
                                setSchedule({ ...schedule, [d]: { ...day, check_out: e.target.value } })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {isAdminRole && (
              <div className="space-y-3 border-t border-border pt-3">
                <p className="text-xs font-semibold text-primary">Financial Adjustments (this month)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Bonus (kyats)</Label>
                    <Input type="number" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} />
                  </div>
                  <div>
                    <Label>Manual Deduction</Label>
                    <Input type="number" value={form.manual_deduction} onChange={(e) => setForm({ ...form, manual_deduction: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Deduction Reason</Label>
                  <Input value={form.deduction_reason} onChange={(e) => setForm({ ...form, deduction_reason: e.target.value })} placeholder="e.g. Equipment damage" />
                </div>
              </div>
            )}

            {isAdminRole && editId && (
              <Card className="border border-primary/30 bg-primary/5 shadow-none">
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-primary">Salary Preview (this month)</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Base</span>
                    <span>{Number(form.base_salary).toLocaleString()} kyats</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">+ Bonus</span>
                    <span className="text-accent">+{(Number(form.bonus) || 0).toLocaleString()} kyats</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">- Auto Deductions</span>
                    <span className="text-destructive">-{(salaryMap[editId]?.total_deductions ?? 0).toLocaleString()} kyats</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">- Manual Deduction</span>
                    <span className="text-destructive">-{(Number(form.manual_deduction) || 0).toLocaleString()} kyats</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-border">
                    <span>Final Salary</span>
                    <span className="text-primary">
                      {Math.max(0, Number(form.base_salary) + (Number(form.bonus) || 0) - (salaryMap[editId]?.total_deductions ?? 0) - (Number(form.manual_deduction) || 0)).toLocaleString()} kyats
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button onClick={handleSave} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Staff Dialog (Admin only) */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Add New Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Full Name *</Label>
              <Input value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="jane@ayty.com" />
            </div>
            <div>
              <Label>Password *</Label>
              <Input type="password" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} placeholder="Min 6 characters" minLength={6} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="assistant">Assistant Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Base Salary (kyats/month)</Label>
              <Input type="number" value={addForm.base_salary} onChange={(e) => setAddForm({ ...addForm, base_salary: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} placeholder="Optional" />
            </div>
            <Button onClick={handleAddStaff} disabled={addLoading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {addLoading ? "Creating..." : "Create Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
