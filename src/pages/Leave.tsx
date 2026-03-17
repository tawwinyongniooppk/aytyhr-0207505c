import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";

interface LeaveRequest {
  id: string;
  date: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
}

export default function Leave() {
  const [requests, setRequests] = useState<LeaveRequest[]>([
    { id: "1", date: "2026-03-20", reason: "Family event", status: "Pending" },
    { id: "2", date: "2026-03-10", reason: "Medical appointment", status: "Approved" },
  ]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !reason) return;
    setRequests([{ id: Date.now().toString(), date, reason, status: "Pending" }, ...requests]);
    setDate("");
    setReason("");
  };

  const statusColor = (s: string) =>
    s === "Approved" ? "text-accent bg-accent/10" : s === "Rejected" ? "text-destructive bg-destructive/10" : "text-orange-600 bg-orange-50";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Leave Requests</h1>
        <p className="text-muted-foreground text-sm mt-1">Submit and track leave requests</p>
      </div>

      <Card className="border border-border shadow-none">
        <CardHeader><CardTitle className="text-base font-display">New Request</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for leave" rows={3} />
            </div>
            <Button type="submit" className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 active:animate-press">
              <FileText className="h-4 w-4 mr-2" /> Submit Request
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-border shadow-none">
        <CardHeader><CardTitle className="text-base font-display">My Requests</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{req.date}</p>
                  <p className="text-xs text-muted-foreground">{req.reason}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor(req.status)}`}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
