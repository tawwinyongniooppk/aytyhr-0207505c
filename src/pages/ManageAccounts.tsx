import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Pencil, Trash2, Loader2, Users, Upload, X, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { withNetworkRetry, isNetworkError, NETWORK_ERROR_MESSAGE } from "@/lib/netRetry";


interface Account {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
  avatar_url: string | null;
  sequence: number;
  class: string;
}

const CLASS_OPTIONS = ["Beginner", "Junior", "Senior", "Neutral"] as const;

const DOMAIN = "@ayty.com";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/jpg", "image/png"];

function validateEmailPrefix(prefix: string): string | null {
  if (!prefix) return "Username is required";
  if (prefix.includes("@")) return "Username should not contain @";
  if (prefix.includes(" ")) return "Username should not contain spaces";
  return null;
}

export default function ManageAccounts() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: "", emailPrefix: "", password: "", role: "staff", sequence: 100, class: "Neutral" });

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", emailPrefix: "", password: "", role: "staff", sequence: 100, class: "Neutral" });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);

  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await withNetworkRetry(
        async () => await supabase.rpc("admin_list_profiles")
      );
      if (error) throw error;
      if (data) setAccounts(data as unknown as Account[]);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Failed to load accounts",
        description: isNetworkError(e) ? NETWORK_ERROR_MESSAGE : e?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
    setLoadingAccounts(false);
  };


  const handleCreate = async () => {
    const emailErr = validateEmailPrefix(createForm.emailPrefix);
    if (emailErr) { toast({ title: "Invalid username", description: emailErr, variant: "destructive" }); return; }
    if (!createForm.full_name) { toast({ title: "Missing name", variant: "destructive" }); return; }
    if (createForm.password.length < 6) { toast({ title: "Password too short", description: "Minimum 6 characters.", variant: "destructive" }); return; }

    setCreateLoading(true);
    try {
      const res = await supabase.functions.invoke("create-staff", {
        body: { email: createForm.emailPrefix + DOMAIN, password: createForm.password, full_name: createForm.full_name, role: createForm.role, sequence: createForm.sequence, class: createForm.class },
      });
      if (res.error || res.data?.error) {
        toast({ title: "Failed", description: res.data?.error || res.error?.message, variant: "destructive" });
      } else {
        toast({ title: "Account created!", description: `${createForm.full_name} can now log in.` });
        setCreateOpen(false);
        setCreateForm({ full_name: "", emailPrefix: "", password: "", role: "staff", sequence: 100, class: "Neutral" });
        loadAccounts();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setCreateLoading(false);
  };

  const openEdit = (account: Account) => {
    setEditAccount(account);
    setEditForm({ full_name: account.full_name, emailPrefix: "", password: "", role: account.role, sequence: account.sequence ?? 100, class: account.class ?? "Neutral" });
    setAvatarPreview(account.avatar_url);
    setAvatarFile(null);
    setEditOpen(true);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only JPG, JPEG, or PNG allowed.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast({ title: "File too large", description: "Maximum 2MB allowed.", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadAvatar = async (userId: string): Promise<string | null> => {
    if (!avatarFile) return null;
    setAvatarUploading(true);
    try {
      const ext = avatarFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      return data.publicUrl;
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!editAccount) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", editAccount.id);
    if (error) {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
      return;
    }
    setAvatarPreview(null);
    setAvatarFile(null);
    toast({ title: "Photo removed" });
    loadAccounts();
  };

  const handleEdit = async () => {
    if (!editAccount) return;
    if (!editForm.full_name) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (editForm.emailPrefix && validateEmailPrefix(editForm.emailPrefix)) {
      toast({ title: "Invalid username", description: validateEmailPrefix(editForm.emailPrefix)!, variant: "destructive" }); return;
    }
    if (editForm.password && editForm.password.length < 6) {
      toast({ title: "Password too short", description: "Min 6 characters.", variant: "destructive" }); return;
    }
    if (editForm.sequence < 1 || editForm.sequence > 100) {
      toast({ title: "Sequence must be 1–100", variant: "destructive" }); return;
    }

    setEditLoading(true);
    try {
      // 1. Update name/email/password/role via edge function
      const res = await supabase.functions.invoke("update-account", {
        body: {
          user_id: editAccount.id,
          full_name: editForm.full_name,
          role: editForm.role,
          email: editForm.emailPrefix ? editForm.emailPrefix + DOMAIN : undefined,
          password: editForm.password || undefined,
          class: editForm.class,
        },
      });
      if (res.error || res.data?.error) {
        toast({ title: "Update failed", description: res.data?.error || res.error?.message, variant: "destructive" });
        setEditLoading(false);
        return;
      }

      // 2. Upload avatar if changed + update sequence/avatar in profiles
      let newAvatarUrl: string | null | undefined;
      if (avatarFile) {
        newAvatarUrl = await uploadAvatar(editAccount.id);
      }

      const profileUpdate: any = { sequence: editForm.sequence };
      if (newAvatarUrl) profileUpdate.avatar_url = newAvatarUrl;

      const { error: pErr } = await supabase.from("profiles").update(profileUpdate).eq("id", editAccount.id);
      if (pErr) {
        toast({ title: "Profile update failed", description: pErr.message, variant: "destructive" });
        setEditLoading(false);
        return;
      }

      toast({ title: "Account updated" });
      setEditOpen(false);
      loadAccounts();
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
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0 overflow-hidden">
                      {acc.avatar_url ? (
                        <img src={acc.avatar_url} alt={acc.full_name} className="h-full w-full object-cover" />
                      ) : (
                        (acc.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2)
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{acc.full_name || "Unnamed"}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">#{acc.sequence ?? 100}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{acc.class ?? "Neutral"}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
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
            <div>
              <Label>Username *</Label>
              <div className="flex items-center rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <Input
                  className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none flex-1 min-w-0"
                  value={createForm.emailPrefix}
                  onChange={(e) => setCreateForm({ ...createForm, emailPrefix: e.target.value })}
                  placeholder="john.doe"
                />
                <span className="px-3 py-2 text-sm text-muted-foreground bg-muted border-l border-input shrink-0 whitespace-nowrap">@ayty.com</span>
              </div>
            </div>
            <div>
              <Label>Password *</Label>
              <div className="relative">
                <Input
                  type={showCreatePassword ? "text" : "password"}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
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
            <div>
              <Label>Class</Label>
              <Select value={createForm.class} onValueChange={(v) => setCreateForm({ ...createForm, class: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Instructional grouping. Only IT Manager can change.</p>
            </div>
            <div>
              <Label>Sequence (1–100)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={createForm.sequence}
                onChange={(e) => setCreateForm({ ...createForm, sequence: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">Lower numbers appear first in lists.</p>
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
            {/* Avatar upload (all roles) */}
            {editAccount && (
              <div className="space-y-2">
                <Label>Profile Photo</Label>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <Users className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      className="hidden"
                      onChange={handleAvatarSelect}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}>
                      <Upload className="h-3.5 w-3.5 mr-1.5" /> {avatarPreview ? "Replace" : "Upload"}
                    </Button>
                    {avatarPreview && (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={handleRemoveAvatar}>
                        <X className="h-3.5 w-3.5 mr-1.5" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">JPG/PNG, max 2MB. Only IT Manager can change this.</p>
              </div>
            )}

            <div><Label>Full Name *</Label><Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
            <div>
              <Label>New Email (leave blank to keep current)</Label>
              <div className="flex items-center rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <Input
                  className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none flex-1 min-w-0"
                  value={editForm.emailPrefix}
                  onChange={(e) => setEditForm({ ...editForm, emailPrefix: e.target.value })}
                  placeholder="john.doe"
                />
                <span className="px-3 py-2 text-sm text-muted-foreground bg-muted border-l border-input shrink-0 whitespace-nowrap">@ayty.com</span>
              </div>
            </div>
            <div>
              <Label>New Password (leave blank to keep current)</Label>
              <div className="relative">
                <Input
                  type={showEditPassword ? "text" : "password"}
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
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
            <div>
              <Label>Class</Label>
              <Select value={editForm.class} onValueChange={(v) => setEditForm({ ...editForm, class: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Instructional grouping. Only IT Manager can change.</p>
            </div>
            <div>
              <Label>Sequence (1–100)</Label>
              <Input type="number" min={1} max={100} value={editForm.sequence} onChange={(e) => setEditForm({ ...editForm, sequence: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground mt-1">Lower numbers appear first. Visible only to IT Manager.</p>
            </div>
            <Button onClick={handleEdit} disabled={editLoading || avatarUploading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              {editLoading || avatarUploading ? "Saving..." : "Save Changes"}
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
