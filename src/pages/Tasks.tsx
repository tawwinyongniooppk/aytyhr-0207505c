import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";

interface Task {
  id: string;
  title: string;
  assignee: string;
  completed: boolean;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "1", title: "Prepare exam papers", assignee: "Alice Johnson", completed: false },
    { id: "2", title: "Update student records", assignee: "Bob Smith", completed: true },
    { id: "3", title: "Organize staff meeting", assignee: "Carol Davis", completed: false },
  ]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", assignee: "" });

  const handleAdd = () => {
    if (!form.title || !form.assignee) return;
    setTasks([...tasks, { ...form, id: Date.now().toString(), completed: false }]);
    setForm({ title: "", assignee: "" });
    setOpen(false);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Tasks</h1>
          <p className="text-muted-foreground text-sm mt-1">{tasks.filter(t => !t.completed).length} pending</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <Plus className="h-4 w-4 mr-2" /> Assign Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Assign Task</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label>Task</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task description" /></div>
              <div>
                <Label>Assign To</Label>
                <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Alice Johnson">Alice Johnson</SelectItem>
                    <SelectItem value="Bob Smith">Bob Smith</SelectItem>
                    <SelectItem value="Carol Davis">Carol Davis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90">Assign</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border border-border shadow-none">
        <CardContent className="p-4">
          <div className="space-y-1">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                <Checkbox checked={task.completed} onCheckedChange={() => toggleTask(task.id)} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.assignee}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${task.completed ? "text-accent bg-accent/10" : "text-orange-600 bg-orange-50"}`}>
                  {task.completed ? "Done" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
