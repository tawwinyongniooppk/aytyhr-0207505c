import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Clock } from "lucide-react";

export default function Attendance() {
  const [status, setStatus] = useState<"not-checked-in" | "checked-in">("not-checked-in");
  const [checkInTime, setCheckInTime] = useState<string | null>(null);

  const handleCheckIn = () => {
    setStatus("checked-in");
    setCheckInTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  const handleCheckOut = () => {
    setStatus("not-checked-in");
    setCheckInTime(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">Mark your attendance for today</p>
      </div>

      <Card className="border border-border shadow-none">
        <CardContent className="p-6 text-center space-y-4">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-muted mx-auto">
            <Clock className="h-8 w-8 text-secondary" />
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Current Status</p>
            <p className={`text-lg font-bold font-display mt-1 ${status === "checked-in" ? "text-accent" : "text-muted-foreground"}`}>
              {status === "checked-in" ? "Present ✓" : "Not Checked In"}
            </p>
            {checkInTime && <p className="text-xs text-muted-foreground mt-1">Checked in at {checkInTime}</p>}
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              onClick={handleCheckIn}
              disabled={status === "checked-in"}
              className="bg-accent text-accent-foreground hover:bg-accent/90 active:animate-press"
            >
              <LogIn className="h-4 w-4 mr-2" /> Check In
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={status === "not-checked-in"}
              variant="outline"
              className="active:animate-press"
            >
              <LogOut className="h-4 w-4 mr-2" /> Check Out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-none">
        <CardContent className="p-4">
          <h3 className="font-display font-semibold text-sm mb-3">Today's Log</h3>
          <div className="space-y-2">
            {[
              { name: "Alice Johnson", time: "7:45 AM", status: "Present" },
              { name: "Bob Smith", time: "8:02 AM", status: "Present" },
              { name: "Carol Davis", time: "--", status: "Not Checked In" },
            ].map((entry) => (
              <div key={entry.name} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary text-xs font-bold">
                    {entry.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">{entry.time}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  entry.status === "Present" ? "text-accent bg-accent/10" : "text-muted-foreground bg-muted"
                }`}>
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
