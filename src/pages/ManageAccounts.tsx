import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function ManageAccounts() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "staff",
    base_salary: "300000",
    phone: "",
  });

  const handleCreate = async () => {
    if (!form.full_name || !form.email || !form.password) {
      toast({ title: "Missing fields", description: "Name, email, and password are required.", variant: "destructive" });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters required.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("create-staff", {
        body: {
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: form.role,
          base_salary: Number(form.base_salary) || 300000,
          phone: form.phone,
        },
      });

      if (res.error) {
        toast({ title: "Failed to create account", description: res.error.message, variant: "destructive" });
      } else if (res.data?.error) {
        toast({ title: "Failed to create account", description: res.data.error, variant: "destructive" });
      } else {
        toast({ title: "Account created!", description: `${form.full_name} can now log in.` });
        setOpen(false);
        setForm({ full_name: "", email: "", password: "", role: "staff", base_salary: "300000", phone: "" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Account Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Create accounts for staff and administrators</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
          <UserPlus className="h-4 w-4 mr-2" /> Create Account
        </Button>
      </div>

      <Card className="border border-border shadow-sm">
        <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[200px]">
          <Shield className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="font-semibold text-lg">IT Manager Portal</h3>
          <p className="text-muted-foreground text-sm max-w-md">
            Your role is limited to creating and managing user accounts. Use the "Create Account" button to add new users to the system.
          </p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Create New Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@school.com" />
            </div>
            <div>
              <Label>Password *</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" minLength={6} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="assistant">Assistant Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Base Salary (kyats/month)</Label>
              <Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional" />
            </div>
            <Button onClick={handleCreate} disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? "Creating..." : "Create Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
