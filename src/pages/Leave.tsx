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
import { ManualDeductionPanel } from "@/components/ManualDeductionPanel";

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
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [staffList, setStaffList] = useState<{ id: string; full_name: string }[]>([]);
  const [unpaidDesc, setUnpaidDesc] = useState("");
  const [unpaidAmount, setUnpaidAmount] = useState("");

  const canManage = isAdmin || isAssistant;
  const canSubmitLeave = isStaff || isAssistant;

  useEffect(() => {
    if (!selectedRequest) { setUnpaidDesc(""); setUnpaidAmount(""); }
  }, [selectedRequest]);

  // Count this user's already-approved Full Leaves in the same month as the selected request
  const overLimitForUnpaid = (() => {
    if (!selectedRequest || selectedRequest.type !== "leave") return false;
    const d = new Date(selectedRequest.date + "T00:00:00");
    const y = d.getFullYear(), m = d.getMonth();
    const source = canManage ? allRequests : myRequests;
    const count = source.filter((r) =>
      r.user_id === selectedRequest.user_id &&
      r.type === "leave" &&
      r.status === "approved" &&
      r.id !== selectedRequest.id &&
      (() => { const x = new Date(r.date + "T00:00:00"); return x.getFullYear() === y && x.getMonth() === m; })()
    ).length;
    return count >= 2;
  })();

  const OVER_LIMIT_MSG =
    "အခု Full Leave တင်သော သူသည် တလ အတွင်းမှာ (2)ရက် ကျော်ပါတော့မည်\nSystem က တလကို (2)ရက်ထက် ပိုပြီး ခွင့်မပြုထားပါ\nသင့်အနေဖြင့် Approve ပေးချင်ပါက ယခု ခွင့်တောင်းခံသော သူကို လစာ ဖြတ်ပြီးမှ Approve ပေးခွင့်ပြုမည်";

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

    // Duplicate guard (uses already-loaded leave logs)
    const sameDate = myRequests.filter((r) => r.date === date && r.status !== "rejected");
    const dupMsg = "သင်၏ ခွင့်ချိန် ခွင့်ရက်များကို (2)ကြိမ်မြောက် တူညီစွာ ယူလို့ မရပါ။";
    if (type === "leave" && sameDate.some((r) => r.type === "leave")) {
      toast({ title: "Duplicate leave", description: dupMsg, variant: "destructive" });
      return;
    }
    if (type === "partial_leave" && sameDate.some((r) =>
      r.type === "partial_leave" && r.start_time && r.end_time &&
      startTime < r.end_time.slice(0,5) && endTime > r.start_time.slice(0,5)
    )) {
      toast({ title: "Duplicate time slot", description: dupMsg, variant: "destructive" });
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

  const handleReview = async (
    requestId: string,
    decision: "approved" | "rejected",
    paymentType?: "paid" | "unpaid",
  ) => {
    if (!user) return;

    setReviewingId(requestId);
    try {
      const updates: any = {
        status: decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      };
      if (decision === "approved") {
        updates.payment_type = paymentType ?? "paid";
      } else {
        updates.payment_type = null;
      }
      const { error } = await supabase
        .from("leave_requests")
        .update(updates)
        .eq("id", requestId);

      if (error) {
        toast({ title: "Review failed", description: error.message, variant: "destructive" });
        return;
      }

      // Apply additional manual salary deduction when approving an over-limit Full Leave as Unpaid
      if (decision === "approved" && paymentType === "unpaid" && overLimitForUnpaid && selectedRequest) {
        const amount = Number(unpaidAmount);
        const desc = unpaidDesc.trim();
        if (!desc || !Number.isFinite(amount) || amount <= 0) {
          toast({ title: "Manual deduction required", description: "Description and amount are required.", variant: "destructive" });
          return;
        }
        const d = new Date(selectedRequest.date + "T00:00:00");
        const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        const { data: existing } = await supabase
          .from("salaries").select("*")
          .eq("user_id", selectedRequest.user_id).eq("month", monthStart).maybeSingle();
        if (!existing) {
          const { data: prof } = await supabase.from("profiles")
            .select("base_salary").eq("id", selectedRequest.user_id).maybeSingle();
          const base = (prof as any)?.base_salary ?? 300000;
          const { error: insErr } = await supabase.from("salaries").insert({
            user_id: selectedRequest.user_id, month: monthStart, base_salary: base,
            current_salary: Math.max(0, base - amount), total_deductions: amount,
            manual_deduction: amount, deduction_reason: desc,
          });
          if (insErr) toast({ title: "Salary deduction failed", description: insErr.message, variant: "destructive" });
        } else {
          const e: any = existing;
          const { error: updErr } = await supabase.from("salaries").update({
            current_salary: Math.max(0, (e.current_salary ?? 0) - amount),
            total_deductions: (e.total_deductions ?? 0) + amount,
            manual_deduction: (e.manual_deduction ?? 0) + amount,
            deduction_reason: e.deduction_reason ? `${e.deduction_reason}; ${desc}` : desc,
            last_updated: new Date().toISOString(),
          }).eq("user_id", selectedRequest.user_id).eq("month", monthStart);
          if (updErr) toast({ title: "Salary deduction failed", description: updErr.message, variant: "destructive" });
        }
      }

      toast({
        title:
          decision === "approved"
            ? paymentType === "unpaid"
              ? "Leave approved as Unpaid ✓"
              : "Leave approved as Paid ✓"
            : "Leave request rejected",
      });
      setSelectedRequest(null);
      loadData();
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

  const filteredAdminRequests = allRequests
    .filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterStaff !== "all" && r.user_id !== filterStaff) return false;
      if (filterFrom && r.date < filterFrom) return false;
      if (filterTo && r.date > filterTo) return false;
      return true;
    })
    .sort((a, b) => {
      const at = new Date(a.reviewed_at || a.created_at).getTime();
      const bt = new Date(b.reviewed_at || b.created_at).getTime();
      return bt - at;
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
        <h1 className="text-2xl font-bold font-display">
          {canManage ? "Leave Control Center" : "Leave Requests"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin
            ? "Central panel: review requests, approve, deduct, and track logs."
            : isAssistant
              ? "Submit your own leave or review staff requests."
              : "Submit and track your personal leave."}
        </p>
      </div>

      {/* STAFF — personal blocks only */}
      {isStaff && (
        <>
          <SectionBlock label="1 · Leave Balance" hint="Your current available leave days.">
            <LeaveBalanceCard />
          </SectionBlock>

          <SectionBlock label="2 · Submit a Leave Request" hint="Choose type, date, and reason.">
            <SubmitForm
              date={date} setDate={setDate}
              reason={reason} setReason={setReason}
              type={type} setType={setType}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime}
              onSubmit={handleSubmit}
              submitting={submitting}
              existingRequests={myRequests}
            />
          </SectionBlock>

          <SectionBlock label="3 · My Leave Logs" hint="Status of your past requests.">
            <MyRequestsList requests={myRequests} statusBadge={statusBadge} />
          </SectionBlock>
        </>
      )}

      {/* ADMIN — central control panel */}
      {isAdmin && (
        <>
          <SectionBlock
            label="A · Leave Logs & Filters"
            hint="All requests sorted by latest update. Click a row to open the approval action."
          >
            <ManageSection
              filterStatus={filterStatus} setFilterStatus={setFilterStatus}
              filterStaff={filterStaff} setFilterStaff={setFilterStaff}
              filterFrom={filterFrom} setFilterFrom={setFilterFrom}
              filterTo={filterTo} setFilterTo={setFilterTo}
              staffList={staffList}
              filteredRequests={filteredAdminRequests}
              statusBadge={statusBadge}
              onSelect={setSelectedRequest}
            />
          </SectionBlock>

          <SectionBlock
            label="B · Manual Deduction Box"
            hint="Apply manual leave-day deductions outside the standard flow."
          >
            <ManualDeductionPanel staffList={staffList} />
          </SectionBlock>

          <SectionBlock
            label="C · Approval Action & Salary Live Update"
            hint="Open a request from the logs above to approve as Paid / Unpaid. Salary updates instantly after Unpaid approvals."
          >
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Select a request from <span className="font-medium text-foreground">Leave Logs</span> to review.
              Approval actions and any required manual salary deductions appear in the review dialog and apply to the salary record in real time.
            </div>
          </SectionBlock>
        </>
      )}

      {/* ASSISTANT — personal + manage tabs */}
      {isAssistant && (
        <Tabs defaultValue="my" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="my" className="flex-1">My Requests</TabsTrigger>
            <TabsTrigger value="manage" className="flex-1">All Requests</TabsTrigger>
          </TabsList>
          <TabsContent value="my" className="space-y-6 mt-4">
            <SectionBlock label="1 · Leave Balance" hint="Your current available leave days.">
              <LeaveBalanceCard />
            </SectionBlock>
            <SectionBlock label="2 · Submit a Leave Request" hint="Choose type, date, and reason.">
              <SubmitForm
                date={date} setDate={setDate}
                reason={reason} setReason={setReason}
                type={type} setType={setType}
                startTime={startTime} setStartTime={setStartTime}
                endTime={endTime} setEndTime={setEndTime}
                onSubmit={handleSubmit}
                submitting={submitting}
                existingRequests={myRequests}
              />
            </SectionBlock>
            <SectionBlock label="3 · My Leave Logs" hint="Status of your past requests.">
              <MyRequestsList requests={myRequests} statusBadge={statusBadge} />
            </SectionBlock>
          </TabsContent>
          <TabsContent value="manage" className="space-y-6 mt-4">
            <SectionBlock
              label="A · Leave Logs & Filters"
              hint="All requests sorted by latest update. Click a row to open the approval action."
            >
              <ManageSection
                filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                filterStaff={filterStaff} setFilterStaff={setFilterStaff}
                filterFrom={filterFrom} setFilterFrom={setFilterFrom}
                filterTo={filterTo} setFilterTo={setFilterTo}
                staffList={staffList}
                filteredRequests={filteredAdminRequests}
                statusBadge={statusBadge}
                onSelect={setSelectedRequest}
              />
            </SectionBlock>
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
                  <span className="font-medium">{TYPE_LABEL[selectedRequest.type]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{selectedRequest.date}</span>
                </div>
                {selectedRequest.type === "partial_leave" && selectedRequest.start_time && selectedRequest.end_time && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span className="font-medium">{selectedRequest.start_time.slice(0,5)} – {selectedRequest.end_time.slice(0,5)}</span>
                  </div>
                )}
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
                <div className="flex flex-col gap-3 pt-2">
                  {overLimitForUnpaid && (
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-3">
                      <p className="text-xs text-warning whitespace-pre-line leading-relaxed">
                        {OVER_LIMIT_MSG}
                      </p>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={unpaidDesc}
                            onChange={(e) => setUnpaidDesc(e.target.value)}
                            placeholder="Reason for salary deduction"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Amount (MMK)</Label>
                          <Input
                            type="number" min={1} step={1}
                            value={unpaidAmount}
                            onChange={(e) => setUnpaidAmount(e.target.value)}
                            placeholder="e.g. 10000"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={() => handleReview(selectedRequest.id, "approved", "paid")}
                      disabled={reviewingId === selectedRequest.id}
                      className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.98] transition-transform"
                    >
                      {reviewingId === selectedRequest.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><CheckCircle className="h-4 w-4 mr-2" /> Approve & Paid</>
                      )}
                    </Button>
                    <Button
                      onClick={() => handleReview(selectedRequest.id, "approved", "unpaid")}
                      disabled={
                        reviewingId === selectedRequest.id ||
                        (overLimitForUnpaid && (!unpaidDesc.trim() || !(Number(unpaidAmount) > 0)))
                      }
                      variant="outline"
                      className="flex-1 border-accent text-accent hover:bg-accent/10 active:scale-[0.98] transition-transform"
                    >
                      {reviewingId === selectedRequest.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><CheckCircle className="h-4 w-4 mr-2" /> Approve & Unpaid</>
                      )}
                    </Button>
                  </div>
                  <Button
                    onClick={() => handleReview(selectedRequest.id, "rejected")}
                    disabled={reviewingId === selectedRequest.id}
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10 active:scale-[0.98] transition-transform"
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
  date, setDate, reason, setReason, type, setType,
  startTime, setStartTime, endTime, setEndTime,
  onSubmit, submitting, existingRequests,
}: {
  date: string; setDate: (v: string) => void;
  reason: string; setReason: (v: string) => void;
  type: LeaveType; setType: (v: LeaveType) => void;
  startTime: string; setStartTime: (v: string) => void;
  endTime: string; setEndTime: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  existingRequests: LeaveRequest[];
}) {
  const dayName = date ? new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }) : "";
  const isPartial = type === "partial_leave";

  const DUPLICATE_MSG = "သင်၏ ခွင့်ချိန် ခွင့်ရက်များကို (2)ကြိမ်မြောက် တူညီစွာ ယူလို့ မရပါ။";

  // Duplicate detection (ignore rejected requests)
  const activeOnDate = date
    ? existingRequests.filter((r) => r.date === date && r.status !== "rejected")
    : [];

  const fullLeaveDuplicate =
    type === "leave" && activeOnDate.some((r) => r.type === "leave");

  const partialOverlap =
    isPartial && startTime && endTime && startTime < endTime
      ? activeOnDate.some(
          (r) =>
            r.type === "partial_leave" &&
            r.start_time &&
            r.end_time &&
            // overlap if start < other.end and end > other.start
            startTime < r.end_time.slice(0, 5) &&
            endTime > r.start_time.slice(0, 5),
        )
      : false;

  const hasDuplicate = fullLeaveDuplicate || partialOverlap;

  const isValid =
    date && reason && (!isPartial || (startTime && endTime && startTime < endTime)) && !hasDuplicate;

  return (
    <Card className="border border-border shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-display">New Request</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label className="mb-2 block">Type</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as LeaveType)} className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="leave" id="leave" />
                <Label htmlFor="leave" className="cursor-pointer">Full Leave</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial_leave" id="partial_leave" />
                <Label htmlFor="partial_leave" className="cursor-pointer">Partial Leave</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="late_excuse" id="late_excuse" />
                <Label htmlFor="late_excuse" className="cursor-pointer">Late Excuse</Label>
              </div>
            </RadioGroup>
            {isPartial && (
              <p className="text-xs text-muted-foreground mt-2">
                Partial Leave is treated as a minute-based deduction (like late check-in / early check-out) and does not reduce your leave-day balance.
              </p>
            )}
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {dayName && <p className="text-xs text-muted-foreground mt-1">{dayName}</p>}
            {fullLeaveDuplicate && (
              <p className="text-xs text-destructive mt-1.5 font-medium">{DUPLICATE_MSG}</p>
            )}
          </div>
          {isPartial && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
              {partialOverlap && (
                <p className="col-span-2 text-xs text-destructive font-medium">{DUPLICATE_MSG}</p>
              )}
            </div>
          )}
          <div>
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                type === "leave" ? "Reason for leave" :
                type === "partial_leave" ? "Reason for partial leave" :
                "Reason for being late"
              }
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{req.date}</p>
                    <Badge variant="outline" className="text-xs">{TYPE_LABEL[req.type]}</Badge>
                    {req.type === "partial_leave" && req.start_time && req.end_time && (
                      <span className="text-xs text-muted-foreground">{req.start_time.slice(0,5)}–{req.end_time.slice(0,5)}</span>
                    )}
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
  filterStatus, setFilterStatus, filterStaff, setFilterStaff,
  filterFrom, setFilterFrom, filterTo, setFilterTo,
  staffList, filteredRequests, statusBadge, onSelect,
}: {
  filterStatus: string;
  setFilterStatus: (f: "all" | "pending" | "approved" | "rejected") => void;
  filterStaff: string;
  setFilterStaff: (f: string) => void;
  filterFrom: string;
  setFilterFrom: (f: string) => void;
  filterTo: string;
  setFilterTo: (f: string) => void;
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
          <SelectTrigger className="w-full sm:w-[180px] h-8">
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
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-8 w-[140px]" />
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-8 w-[140px]" />
        </div>
        {(filterFrom || filterTo || filterStaff !== "all") && (
          <Button size="sm" variant="ghost" onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterStaff("all"); }}>
            Clear
          </Button>
        )}
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
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-muted-foreground">{req.date}</p>
                      <Badge variant="outline" className="text-xs">{TYPE_LABEL[req.type]}</Badge>
                      {req.type === "partial_leave" && req.start_time && req.end_time && (
                        <span className="text-xs text-muted-foreground">{req.start_time.slice(0,5)}–{req.end_time.slice(0,5)}</span>
                      )}
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

function SectionBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
          {label}
        </h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}
