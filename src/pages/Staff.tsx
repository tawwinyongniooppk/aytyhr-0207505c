import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Phone } from "lucide-react";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  salary: string;
  phone: string;
  joinDate: string;
}

const initialStaff: StaffMember[] = [
  { id: "1", name: "Alice Johnson", role: "Admin", salary: "45,000", phone: "555-0101", joinDate: "2023-01-15" },
  { id: "2", name: "Bob Smith", role: "Staff", salary: "35,000", phone: "555-0102", joinDate: "2023-03-20" },
  { id: "3", name: "Carol Davis", role: "Assistant Admin", salary: "40,000", phone: "555-0103", joinDate: "2024-06-01" },
];

export default function Staff() {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", salary: "", phone: "", joinDate: "" });

  const handleAdd = () => {
    if (!form.name) return;
    setStaff([...staff, { ...form, id: Date.now().toString() }]);
    setForm({ name: "", role: "", salary: "", phone: "", joinDate: "" });
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Staff</h1>
          <p className="text-muted-foreground text-sm mt-1">{staff.length} members</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <Plus className="h-4 w-4 mr-2" /> Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Add Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label>Full Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter name" />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Assistant Admin">Assistant Admin</SelectItem>
                    <SelectItem value="Staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Salary</Label>
                <Input value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="e.g. 35,000" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" />
              </div>
              <div>
                <Label>Join Date</Label>
                <Input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
              </div>
              <Button onClick={handleAdd} className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90">
                Add Member
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((member) => (
          <Card key={member.id} className="border border-border shadow-none">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary text-sm font-bold shrink-0">
                  {member.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{member.name}</h3>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>₦{member.salary}</span>
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{member.phone}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
