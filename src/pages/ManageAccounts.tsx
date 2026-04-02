import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Shield, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Account {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
}

const DOMAIN = "@ayty.com";

function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!email.endsWith(DOMAIN)) return `Only ${DOMAIN} emails are allowed`;
  return null;
}

export default function ManageAccounts() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: "", email: "", password: "", role: "staff" });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", password: "", role: "staff" });

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);

  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data } = await supabase.from("profiles").select("id, full_name, role, created_at").order("created_at", { ascending: true });
      if (data) setAccounts(data as unknown as Account[]);
    } catch (e) {
      console.error(e);
    }
    setLoadingAccounts(false);
  };

  const handleCreate = async () => {
    const emailErr = validateEmail(createForm.email);
    if (emailErr) { toast({ title: "Invalid email", description: emailErr, variant: "destructive" }); return; }
    if (!createForm.full_name) { toast({ title: "Missing name", variant: "destructive" }); return; }
    if (createForm.password.length < 6) { toast({ title: "Password too short", description: "Minimum 6 characters.", variant: "destructive" }); return; }

    setCreateLoading(true);
    try {
      const res = await supabase.functions.invoke("create-staff", {
        body: { email: createForm.email, password: createForm.password, full_name: createForm.full_name, role: createForm.role },
      });
      if (res.error || res.data?.error) {
        toast({ title: "Failed", description: res.data?.error || res.error?.message, variant: "destructive" });
      } else {
        toast({ title: "Account created!", description: `${createForm.full_name} can now log in.` });
        setCreateOpen(false);
        setCreateForm({ full_name: "", email: "", password: "", role: "staff" });
        loadAccounts();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setCreateLoading(false);
  };

  const openEdit = (account: Account) => {
    setEditAccount(account);
    setEditForm({ full_name: account.full_name, email: "", password: "", role: account.role });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editAccount) return;
    if (!editForm.full_name) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (editForm.email && validateEmail(editForm.email)) {
      toast({ title: "Invalid email", description: validateEmail(editForm.email)!, variant: "destructive" }); return;
    }
    if (editForm.password && editForm.password.length < 6) {
      toast({ title: "Password too short", description: "Min 6 characters.", variant: "destructive" }); return;
    }

    setEditLoading(true);
    try {
      const res = await supabase.functions.invoke("update-account", {
        body: {
          user_id: editAccount.id,
          full_name: editForm.full_name,
          role: editForm.role,
          email: editForm.email || undefined,
          password: editForm.password || undefined,
        },
      });
      if (res.error || res.data?.error) {
        toast({ title: "Update failed", description: res.data?.error || res.error?.message, variant: "destructive" });
      } else {
        toast({ title: "Account updated" });
        setEditOpen(false);
        loadAccounts();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setEditLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteAccount) return;
    setDeleteLoading(true);
    try {
      const res = await supabase.functions.invoke("delete-account", {
        body: { user_id: deleteAccount.id },
      });
      if (res.error || res.data?.error) {
        toast({ title: "Delete failed", description: res.data?.error || res.error?.message, variant: "destructive" });
      } else {
        toast({ title: "Account deleted" });
        setDeleteOpen(false);
        setDeleteAccount(null);
        loadAccounts();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setDeleteLoading(false);
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-primary/10 text-primary",
      assistant: "bg-accent/10 text-accent-foreground",
      staff: "bg-muted text-muted-foreground",
      it_manager: "bg-secondary/10 text-secondary-foreground",
    };
    return <Badge className={`${colors[role] || "bg-muted text-muted-foreground"} capitalize`}>{role.replace("_", " ")}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Account Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Create, edit, and delete user accounts</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
          <UserPlus className="h-4 w-4 mr-2" /> Create Account
        </Button>
      </div>

      {/* Account List */}
      {loadingAccounts ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
        </div>
      ) : accounts.length === 0 ? (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[200px]">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">No accounts found.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className="border border-border shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">{acc.full_name || "Unnamed"}</h3>
                    {roleBadge(acc.role)}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(acc)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setDeleteAccount(acc); setDeleteOpen(true); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Create New Account</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Full Name *</Label><Input value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} placeholder="Jane Doe" /></div>
            <div><Label>Email *</Label><Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder={`user${DOMAIN}`} /></div>
            <div><Label>Password *</Label><Input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Min 6 characters" /></div>
            <div>
              <Label>Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="assistant">Assistant Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={createLoading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {createLoading ? "Creating..." : "Create Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditAccount(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Edit Account</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div><Label>Full Name *</Label><Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
            <div><Label>New Email (leave blank to keep current)</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder={`user${DOMAIN}`} /></div>
            <div><Label>New Password (leave blank to keep current)</Label><Input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Min 6 characters" /></div>
            <div>
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="assistant">Assistant Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="it_manager">IT Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleEdit} disabled={editLoading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {editLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setDeleteAccount(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display text-destructive">Delete Account</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{deleteAccount?.full_name}</strong>? This action cannot be undone.</p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
