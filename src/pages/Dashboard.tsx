import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, ClipboardList, Bell } from "lucide-react";

const stats = [
  { title: "Total Staff", value: "24", icon: Users, color: "text-secondary" },
  { title: "Present Today", value: "18", icon: Clock, color: "text-accent" },
  { title: "Pending Tasks", value: "7", icon: ClipboardList, color: "text-orange-500" },
  { title: "Notifications", value: "3", icon: Bell, color: "text-destructive" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Good morning 👋</h1>
        <p className="text-muted-foreground text-sm mt-1">Here's what's happening today</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border border-border shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-display">Recent Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {["Alice Johnson", "Bob Smith", "Carol Davis"].map((name) => (
                <div key={name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary text-xs font-bold">
                      {name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <span className="text-sm font-medium">{name}</span>
                  </div>
                  <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-1 rounded-full">Present</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-display">Upcoming Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { task: "Submit report", assignee: "Alice", due: "Today" },
                { task: "Staff meeting prep", assignee: "Bob", due: "Tomorrow" },
                { task: "Inventory check", assignee: "Carol", due: "Mar 19" },
              ].map((item) => (
                <div key={item.task} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{item.task}</p>
                    <p className="text-xs text-muted-foreground">{item.assignee}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.due}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
