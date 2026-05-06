import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Wallet, TrendingDown, DollarSign, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";

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
}

const WORK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface SalaryRecord {
  base_salary: number;
  current_salary: number;
  total_deductions: number;
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
  const [deductionRate, setDeductionRate] = useState(200);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "", check_in_time: "09:00", check_out_time: "16:00", work_day: "Monday" });
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

    const [profilesRes, salariesRes, settRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      supabase.from("salaries").select("*").eq("month", monthStart),
      supabase.from("app_settings").select("*").eq("key", "deduction_rate_per_minute").maybeSingle(),
    ]);

    if (profilesRes.data) {
      // Hide IT Manager from admin/assistant staff list
      const filtered = (profilesRes.data as unknown as StaffProfile[]).filter(p => p.role !== "it_manager");
      setStaff(filtered);
    }

    if (salariesRes.data) {
      const map: Record<string, SalaryRecord> = {};
      (salariesRes.data as unknown as (SalaryRecord & { user_id: string })[]).forEach((s) => {
        map[s.user_id] = s;
      });
      setSalaryMap(map);
    }

    if (settRes.data) setDeductionRate(Number((settRes.data as any).value) || 200);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.full_name || !user) return;

    if (editId) {
      const updateData: any = {
        full_name: form.full_name,
        role: form.role,
        phone: form.phone,
        join_date: form.join_date || null,
        check_in_time: form.check_in_time || "09:00",
        check_out_time: form.check_out_time || "16:00",
        work_day: form.work_day || "Monday",
      };
      // Only admin can update salary
      if (isAdminRole) {
        updateData.base_salary = Number(form.base_salary) || 300000;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", editId);

      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Staff updated" });
    }

    setForm({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "", check_in_time: "09:00", check_out_time: "16:00", work_day: "Monday" });
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
    setForm({
      full_name: member.full_name,
      role: member.role,
      base_salary: String(member.base_salary),
      phone: member.phone || "",
      join_date: member.join_date || "",
      check_in_time: member.check_in_time || "09:00",
      check_out_time: member.check_out_time || "16:00",
      work_day: member.work_day || "Monday",
    });
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
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                    {member.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{member.full_name || "Unnamed"}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{member.role.replace("_", " ")}</p>
                    {member.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Phone className="h-3 w-3" />{member.phone}
                      </span>
                    )}
                  </div>
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
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "", check_in_time: "09:00", check_out_time: "16:00", work_day: "Monday" }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Edit Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
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
            <div>
              <Label>Work Day (weekly)</Label>
              <Select value={form.work_day} onValueChange={(v) => setForm({ ...form, work_day: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORK_DAYS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Check-in Time</Label>
                <Input type="time" value={form.check_in_time} onChange={(e) => setForm({ ...form, check_in_time: e.target.value })} />
              </div>
              <div>
                <Label>Check-out Time</Label>
                <Input type="time" value={form.check_out_time} onChange={(e) => setForm({ ...form, check_out_time: e.target.value })} />
              </div>
            </div>

            {isAdminRole && editId && salaryMap[editId] && (
              <Card className="border border-primary/30 bg-primary/5 shadow-none">
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-primary">Salary Preview (this month)</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Base</span>
                    <span>{Number(form.base_salary).toLocaleString()} kyats</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Deductions</span>
                    <span className="text-destructive">-{salaryMap[editId].total_deductions.toLocaleString()} kyats</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-border">
                    <span>Remaining</span>
                    <span className="text-primary">
                      {Math.max(0, Number(form.base_salary) - salaryMap[editId].total_deductions).toLocaleString()} kyats
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
        <DialogContent>
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
