import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  assigned_by: string;
  completed: boolean;
  created_at: string;
}

interface StaffMember {
  id: string;
  full_name: string;
}

export default function Tasks() {
  const { user } = useAuth();
  const { isAdmin, isStaff } = useProfile();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assignee_id: "" });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const [tasksRes, profilesRes] = await Promise.all([
        supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, role"),
      ]);

      if (profilesRes.data) {
        const staff = profilesRes.data.filter((p) => p.role === "staff");
        setStaffList(staff);
        const names: Record<string, string> = {};
        profilesRes.data.forEach((p) => { names[p.id] = p.full_name || "Unknown"; });
        setStaffNames(names);
      }

      if (tasksRes.data) {
        let filtered = tasksRes.data as TaskRow[];
        if (isStaff && user) {
          filtered = filtered.filter((t) => t.assignee_id === user.id);
        }
        setTasks(filtered);
      }
    } catch {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!form.title || !form.assignee_id || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("tasks").insert({
        title: form.title,
        description: form.description,
        assignee_id: form.assignee_id,
        assigned_by: user.id,
      });
      if (error) {
        toast.error("Failed to assign task");
        return;
      }
      toast.success("Task assigned successfully");
      setForm({ title: "", description: "", assignee_id: "" });
      setOpen(false);
      loadData();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleTask(id: string, currentValue: boolean) {
    setTogglingId(id);
    try {
      const { error } = await supabase.from("tasks").update({ completed: !currentValue }).eq("id", id);
      if (error) {
        toast.error("Failed to update task");
        return;
      }
      const newStatus = !currentValue;
      toast.success(newStatus ? "Task marked as completed" : "Task marked as pending");
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: newStatus } : t)));
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading tasks...</p>
      </div>
    );
  }

  const pendingCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Tasks</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">
              {pendingCount} pending
            </Badge>
            <Badge variant="secondary" className="bg-accent/10 text-accent text-xs">
              {completedCount} done
            </Badge>
          </div>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> Assign Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Assign Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Task Title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Task title"
                  />
                </div>
                <div>
                  <Label>Instructions / What to do</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe what needs to be done..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Assign To</Label>
                  <Select value={form.assignee_id} onValueChange={(v) => setForm({ ...form, assignee_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_name || "Unnamed"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={submitting || !form.title || !form.assignee_id}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Assigning...
                    </>
                  ) : (
                    "Assign"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border border-border shadow-sm">
        <CardContent className="p-4">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <ClipboardList className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No tasks assigned yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-start gap-3 py-3 px-3 rounded-lg border-b border-border last:border-0 ${
                    task.completed
                      ? "bg-accent/5"
                      : "bg-destructive/5 border-l-2 border-l-destructive"
                  }`}
                >
                  {togglingId === task.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5 shrink-0" />
                  ) : (
                    <Checkbox
                      checked={task.completed}
                      onCheckedChange={() => toggleTask(task.id, task.completed)}
                      className="mt-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Assigned to: {staffNames[task.assignee_id] || "Unknown"}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs shrink-0 ${
                      task.completed
                        ? "bg-accent/10 text-accent"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {task.completed ? "Done" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
