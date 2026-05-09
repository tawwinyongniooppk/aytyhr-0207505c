import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle, XCircle, Clock, Filter, Loader2, Inbox, Users } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeaveBalanceCard } from "@/components/LeaveBalanceCard";

type LeaveType = "leave" | "partial_leave" | "late_excuse";

const TYPE_LABEL: Record<LeaveType, string> = {
  leave: "Full Leave",
  partial_leave: "Partial Leave",
  late_excuse: "Late Excuse",
};

interface LeaveRequest {
  id: string;
  user_id: string;
  date: string;
  type: LeaveType;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  start_time: string | null;
  end_time: string | null;
  profile_name?: string;
}

export default function Leave() {
  const { user } = useAuth();
  const { profile, isAdmin, isAssistant, isStaff } = useProfile();
  const { toast } = useToast();
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<LeaveType>("leave");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [filterStaff, setFilterStaff] = useState("all");
  const [staffList, setStaffList] = useState<{ id: string; full_name: string }[]>([]);

  const canManage = isAdmin || isAssistant;
  const canSubmitLeave = isStaff || isAssistant;

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user, isAdmin, isAssistant, isStaff]);

  const loadData = async () => {
    setLoading(true);

    const myPromise = canSubmitLeave
      ? supabase.from("leave_requests").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).then(r => r)
      : Promise.resolve({ data: [] as any[] });

    const allPromise = canManage
      ? supabase.from("leave_requests").select("*").order("created_at", { ascending: false }).then(r => r)
      : Promise.resolve({ data: [] as any[] });

    const staffPromise = canManage
      ? supabase.from("profiles").select("id, full_name, role").in("role", ["staff", "assistant"]).then(r => r)
      : Promise.resolve({ data: [] as any[] });

    const [myRes, allRes, staffRes] = await Promise.all([myPromise, allPromise, staffPromise]);

    if (myRes.data) setMyRequests(myRes.data as unknown as LeaveRequest[]);

    if (staffRes.data) {
      setStaffList((staffRes.data as any[]).map((p: any) => ({ id: p.id, full_name: p.full_name })));
    }

    if (canManage && allRes.data) {
      const all = allRes.data as any[];
      const userIds = [...new Set(all.map((r: any) => r.user_id))];
      if (userIds.length > 0) {
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
      } else {
        setAllRequests([]);
      }
    }

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !reason || !user) return;
    if (type === "partial_leave" && (!startTime || !endTime)) return;
    if (type === "partial_leave" && startTime >= endTime) {
      toast({ title: "Invalid time range", description: "End time must be after start time.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        user_id: user.id,
        date,
        type,
        reason,
        status: "pending",
        start_time: type === "partial_leave" ? startTime : null,
        end_time: type === "partial_leave" ? endTime : null,
      };
      const { error } = await supabase.from("leave_requests").insert(payload);

      if (error) {
        toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Leave request submitted successfully ✓" });
        setDate("");
        setReason("");
        setType("leave");
        setStartTime("");
        setEndTime("");
        loadData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (requestId: string, decision: "approved" | "rejected") => {
    if (!user) return;

    setReviewingId(requestId);
    try {
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
        toast({ title: decision === "approved" ? "Leave request approved ✓" : "Leave request rejected" });
        setSelectedRequest(null);
        loadData();
      }
    } finally {
      setReviewingId(null);
    }
  };

  const statusBadge = (s: string) => {
    const config = {
      approved: { cls: "bg-accent/10 text-accent", icon: <CheckCircle className="h-3.5 w-3.5" /> },
      rejected: { cls: "bg-destructive/10 text-destructive", icon: <XCircle className="h-3.5 w-3.5" /> },
      pending: { cls: "bg-warning/10 text-warning", icon: <Clock className="h-3.5 w-3.5" /> },
    }[s] || { cls: "bg-muted text-muted-foreground", icon: <Clock className="h-3.5 w-3.5" /> };

    return (
      <Badge variant="secondary" className={`text-xs flex items-center gap-1 ${config.cls}`}>
        {config.icon}
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </Badge>
    );
  };

  const filteredAdminRequests = allRequests.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterStaff !== "all" && r.user_id !== filterStaff) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Leave Requests</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Leave Requests</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {canManage ? "Manage leave requests" : "Submit and track your leave requests"}
        </p>
      </div>

      {(isStaff || isAssistant) && <LeaveBalanceCard />}

      {isStaff && (
        <>
          <SubmitForm
            date={date} setDate={setDate}
            reason={reason} setReason={setReason}
            type={type} setType={setType}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
          <MyRequestsList requests={myRequests} statusBadge={statusBadge} />
        </>
      )}

      {isAdmin && (
        <ManageSection
          filterStatus={filterStatus} setFilterStatus={setFilterStatus}
          filterStaff={filterStaff} setFilterStaff={setFilterStaff}
          staffList={staffList}
          filteredRequests={filteredAdminRequests}
          statusBadge={statusBadge}
          onSelect={setSelectedRequest}
        />
      )}

      {isAssistant && (
        <Tabs defaultValue="my" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="my" className="flex-1">My Requests</TabsTrigger>
            <TabsTrigger value="manage" className="flex-1">All Requests</TabsTrigger>
          </TabsList>
          <TabsContent value="my" className="space-y-6 mt-4">
            <SubmitForm
              date={date} setDate={setDate}
              reason={reason} setReason={setReason}
              type={type} setType={setType}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
            <MyRequestsList requests={myRequests} statusBadge={statusBadge} />
          </TabsContent>
          <TabsContent value="manage" className="space-y-6 mt-4">
            <ManageSection
              filterStatus={filterStatus} setFilterStatus={setFilterStatus}
              filterStaff={filterStaff} setFilterStaff={setFilterStaff}
              staffList={staffList}
              filteredRequests={filteredAdminRequests}
              statusBadge={statusBadge}
              onSelect={setSelectedRequest}
            />
          </TabsContent>
        </Tabs>
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
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  {statusBadge(selectedRequest.status)}
                </div>
              </div>
              {selectedRequest.status === "pending" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleReview(selectedRequest.id, "approved")}
                    disabled={reviewingId === selectedRequest.id}
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.98] transition-transform"
                  >
                    {reviewingId === selectedRequest.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><CheckCircle className="h-4 w-4 mr-2" /> Approve</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleReview(selectedRequest.id, "rejected")}
                    disabled={reviewingId === selectedRequest.id}
                    variant="outline"
                    className="flex-1 border-destructive text-destructive hover:bg-destructive/10 active:scale-[0.98] transition-transform"
                  >
                    {reviewingId === selectedRequest.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><XCircle className="h-4 w-4 mr-2" /> Reject</>
                    )}
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

/* ---------- Sub-components ---------- */

function SubmitForm({
  date, setDate, reason, setReason, type, setType, onSubmit, submitting,
}: {
  date: string; setDate: (v: string) => void;
  reason: string; setReason: (v: string) => void;
  type: "leave" | "late_excuse"; setType: (v: "leave" | "late_excuse") => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
}) {
  const isValid = date && reason;
  return (
    <Card className="border border-border shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-display">New Request</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
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
            disabled={submitting || !isValid}
            className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 active:scale-[0.98] transition-transform"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
            ) : (
              <><FileText className="h-4 w-4 mr-2" /> Submit Request</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MyRequestsList({
  requests, statusBadge,
}: {
  requests: LeaveRequest[];
  statusBadge: (s: string) => React.ReactNode;
}) {
  return (
    <Card className="border border-border shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-display">My Requests</CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Inbox className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No leave requests yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{req.date}</p>
                    <Badge variant="outline" className="text-xs">
                      {req.type === "late_excuse" ? "Late Excuse" : "Leave"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{req.reason}</p>
                </div>
                {statusBadge(req.status)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManageSection({
  filterStatus, setFilterStatus, filterStaff, setFilterStaff, staffList, filteredRequests, statusBadge, onSelect,
}: {
  filterStatus: string;
  setFilterStatus: (f: "all" | "pending" | "approved" | "rejected") => void;
  filterStaff: string;
  setFilterStaff: (f: string) => void;
  staffList: { id: string; full_name: string }[];
  filteredRequests: LeaveRequest[];
  statusBadge: (s: string) => React.ReactNode;
  onSelect: (r: LeaveRequest) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <Button
            key={f}
            variant={filterStatus === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(f)}
            className={filterStatus === f ? "bg-secondary text-secondary-foreground" : ""}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
        <Select value={filterStaff} onValueChange={setFilterStaff}>
          <SelectTrigger className="w-[180px] h-8">
            <Users className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="All Staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staffList.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.full_name || "Unnamed"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="border border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base font-display">
            Staff Requests ({filteredRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Inbox className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No {filterStatus !== "all" ? filterStatus : ""} requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between py-3 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
                  onClick={() => onSelect(req)}
                >
                  <div>
                    <p className="text-sm font-medium">{req.profile_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">{req.date}</p>
                      <Badge variant="outline" className="text-xs">
                        {req.type === "late_excuse" ? "Late Excuse" : "Leave"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{req.reason}</p>
                  </div>
                  {statusBadge(req.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
