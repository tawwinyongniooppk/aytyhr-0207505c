import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ClipboardList } from "lucide-react";

interface TaskRow {
  id: string;
  title: string;
  description: string;
  assignee_id: string;
  completed: boolean;
  created_at: string;
}

interface StaffTaskViewProps {
  tasks: TaskRow[];
  togglingId: string | null;
  onToggle: (id: string, current: boolean) => void;
}

export function StaffTaskView({ tasks, togglingId, onToggle }: StaffTaskViewProps) {
  const pendingCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">My Tasks</h1>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">
            {pendingCount} pending
          </Badge>
          <Badge variant="secondary" className="bg-accent/10 text-accent text-xs">
            {completedCount} done
          </Badge>
        </div>
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
                    task.completed ? "bg-accent/5" : "bg-destructive/5 border-l-2 border-l-destructive"
                  }`}
                >
                  {togglingId === task.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5 shrink-0" />
                  ) : (
                    <Checkbox
                      checked={task.completed}
                      onCheckedChange={() => onToggle(task.id, task.completed)}
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
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs shrink-0 ${
                      task.completed ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"
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
