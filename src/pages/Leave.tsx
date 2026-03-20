import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, CheckCircle, XCircle, Clock, Filter } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface LeaveRequest {
  id: string;
  user_id: string;
  date: string;
  type: "leave" | "late_excuse";
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  // joined
  profile_name?: string;
}

export default function Leave() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"leave" | "late_excuse">("leave");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);

    const [myReqs, profileRes] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("role").eq("id", user!.id).single(),
    ]);

    if (myReqs.data) setRequests(myReqs.data as unknown as LeaveRequest[]);

    const admin = (profileRes.data as any)?.role === "admin";
    setIsAdmin(admin);

    if (admin) {
      const { data: all } = await supabase
        .from("leave_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (all) {
        // Fetch profile names
        const userIds = [...new Set((all as any[]).map((r: any) => r.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        const nameMap: Record<string, string> = {};
        (profiles as any[])?.forEach((p: any) => (nameMap[p.id] = p.full_name));

        setAllRequests(
          (all as unknown as LeaveRequest[]).map((r) => ({
            ...r,
            profile_name: nameMap[r.user_id] || "Unknown",
          }))
        );
      }
    }

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !reason || !user) return;

    const { error } = await supabase.from("leave_requests").insert({
      user_id: user.id,
      date,
      type,
      reason,
      status: "pending",
    } as any);

    if (error) {
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Request submitted ✓" });
      setDate("");
      setReason("");
      setType("leave");
      loadData();
    }
  };

  const handleReview = async (requestId: string, decision: "approved" | "rejected") => {
    if (!user) return;

    const { error } = await supabase
      .from("leave_requests")
      .update({
        status: decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", requestId);

    if (error) {
      toast({ title: "Review failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Request ${decision} ✓` });
      setSelectedRequest(null);
      loadData();
    }
  };

  const statusColor = (s: string) =>
    s === "approved"
      ? "text-accent bg-accent/10"
      : s === "rejected"
        ? "text-destructive bg-destructive/10"
        : "text-orange-600 bg-orange-50";

  const statusIcon = (s: string) =>
    s === "approved" ? (
      <CheckCircle className="h-3.5 w-3.5" />
    ) : s === "rejected" ? (
      <XCircle className="h-3.5 w-3.5" />
    ) : (
      <Clock className="h-3.5 w-3.5" />
    );

  const filteredAdminRequests =
    filter === "all" ? allRequests : allRequests.filter((r) => r.status === filter);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Leave Requests</h1>
        </div>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Leave Requests</h1>
        <p className="text-muted-foreground text-sm mt-1">Submit and track leave or late excuse requests</p>
      </div>

      {/* Admin Toggle */}
      {isAdmin && (
        <div className="flex gap-2">
          <Button
            variant={!showAdmin ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAdmin(false)}
            className={!showAdmin ? "bg-secondary text-secondary-foreground" : ""}
          >
            My Requests
          </Button>
          <Button
            variant={showAdmin ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAdmin(true)}
            className={showAdmin ? "bg-secondary text-secondary-foreground" : ""}
          >
            Review Requests
          </Button>
        </div>
      )}

      {/* Submit Form */}
      {!showAdmin && (
        <Card className="border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-display">New Request</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="mb-2 block">Type</Label>
                <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="leave" id="leave" />
                    <Label htmlFor="leave" className="cursor-pointer">Leave</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="late_excuse" id="late_excuse" />
                    <Label htmlFor="late_excuse" className="cursor-pointer">Late Excuse</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={type === "leave" ? "Reason for leave" : "Reason for being late"}
                  rows={3}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 active:scale-[0.98] transition-transform"
              >
                <FileText className="h-4 w-4 mr-2" /> Submit Request
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* My Requests List */}
      {!showAdmin && (
        <Card className="border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-display">My Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests yet. Submit one above.</p>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{req.date}</p>
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {req.type === "late_excuse" ? "Late Excuse" : "Leave"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{req.reason}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${statusColor(req.status)}`}>
                      {statusIcon(req.status)}
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin Review Panel */}
      {showAdmin && (
        <>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {(["pending", "approved", "rejected", "all"] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
                className={filter === f ? "bg-secondary text-secondary-foreground" : ""}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
          <Card className="border border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-display">
                Staff Requests ({filteredAdminRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredAdminRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No {filter} requests.</p>
              ) : (
                <div className="space-y-3">
                  {filteredAdminRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between py-3 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
                      onClick={() => setSelectedRequest(req)}
                    >
                      <div>
                        <p className="text-sm font-medium">{req.profile_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">{req.date}</p>
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {req.type === "late_excuse" ? "Late Excuse" : "Leave"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{req.reason}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 shrink-0 ${statusColor(req.status)}`}>
                        {statusIcon(req.status)}
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Review Request</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 py-2">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Staff</span>
                  <span className="font-medium">{selectedRequest.profile_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">
                    {selectedRequest.type === "late_excuse" ? "Late Excuse" : "Leave"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{selectedRequest.date}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Reason</span>
                  <p className="mt-1 p-2 bg-muted rounded text-sm">{selectedRequest.reason}</p>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${statusColor(selectedRequest.status)}`}>
                    {statusIcon(selectedRequest.status)}
                    {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                  </span>
                </div>
              </div>
              {selectedRequest.status === "pending" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleReview(selectedRequest.id, "approved")}
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.98] transition-transform"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" /> Approve
                  </Button>
                  <Button
                    onClick={() => handleReview(selectedRequest.id, "rejected")}
                    variant="outline"
                    className="flex-1 border-destructive text-destructive hover:bg-destructive/10 active:scale-[0.98] transition-transform"
                  >
                    <XCircle className="h-4 w-4 mr-2" /> Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
