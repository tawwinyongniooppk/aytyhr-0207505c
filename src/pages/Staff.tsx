import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Phone, Wallet, TrendingDown, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface StaffProfile {
  id: string;
  full_name: string;
  role: string;
  base_salary: number;
  phone: string;
  join_date: string;
}

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
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [salaryMap, setSalaryMap] = useState<Record<string, SalaryRecord>>({});
  const [deductionRate, setDeductionRate] = useState(200);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "" });

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
      setStaff(profilesRes.data as unknown as StaffProfile[]);
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
      // Update existing profile
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name,
          role: form.role,
          base_salary: Number(form.base_salary) || 300000,
          phone: form.phone,
          join_date: form.join_date || null,
        } as any)
        .eq("id", editId);

      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Staff updated" });
    }

    setForm({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "" });
    setEditId(null);
    setOpen(false);
    loadData();
  };

  const openEdit = (member: StaffProfile) => {
    setEditId(member.id);
    setForm({
      full_name: member.full_name,
      role: member.role,
      base_salary: String(member.base_salary),
      phone: member.phone || "",
      join_date: member.join_date || "",
    });
    setOpen(true);
  };

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold font-display">Staff</h1></div>
        <p className="text-muted-foreground text-sm">Loading...</p>
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
      </div>

      {/* Staff Cards with Salary Preview */}
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
              className="border border-border shadow-none cursor-pointer hover:border-secondary/50 transition-colors"
              onClick={() => openEdit(member)}
            >
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary text-sm font-bold shrink-0">
                    {member.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{member.full_name || "Unnamed"}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{member.role}</p>
                    {member.phone && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Phone className="h-3 w-3" />{member.phone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Salary Preview */}
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
                      <Wallet className="h-3.5 w-3.5 text-secondary" /> Remaining
                    </span>
                    <span className="font-bold text-secondary">{remaining.toLocaleString()} kyats</span>
                  </div>
                </div>

                {/* Status indicator */}
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
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); setForm({ full_name: "", role: "staff", base_salary: "300000", phone: "", join_date: "" }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? "Edit Staff" : "Staff Details"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Full Name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Enter name" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="assistant_admin">Assistant Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Base Salary (kyats/month)</Label>
              <Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="e.g. 300000" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" />
            </div>
            <div>
              <Label>Join Date</Label>
              <Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} />
            </div>

            {/* Live Salary Preview in edit */}
            {editId && salaryMap[editId] && (
              <Card className="border border-secondary/30 bg-secondary/5 shadow-none">
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-secondary">Salary Preview (this month)</p>
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
                    <span className="text-secondary">
                      {Math.max(0, Number(form.base_salary) - salaryMap[editId].total_deductions).toLocaleString()} kyats
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button onClick={handleSave} className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90">
              {editId ? "Save Changes" : "Close"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
