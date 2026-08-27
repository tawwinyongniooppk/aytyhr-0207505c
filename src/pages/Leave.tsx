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
import { sendPush, notifyAdmins } from "@/lib/push";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeaveBalanceCard } from "@/components/LeaveBalanceCard";
import { ManualDeductionPanel } from "@/components/ManualDeductionPanel";
import { OvertimeSection } from "@/components/OvertimeSection";
import { getMMTDateParts, getMMTTodayISO } from "@/lib/mmt";

type LeaveType = "leave" | "half_leave" | "partial_leave";

const TYPE_LABEL: Record<LeaveType, string> = {
  leave: "Full Leave",
  half_leave: "Half Leave",
  partial_leave: "Partial Leave",
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
  half_period?: "morning" | "afternoon" | null;
  profile_name?: string;
}

const halfPeriodLabel = (p?: string | null) =>
  p === "morning" ? "Morning Half-Leave" : p === "afternoon" ? "Afternoon Half-Leave" : "";

export default function Leave() {
  const { user } = useAuth();
  const { profile, isAdmin, isAssistant, isStaff } = useProfile();
  const { toast } = useToast();
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<LeaveType>("leave");
  const [halfPeriod, setHalfPeriod] = useState<"morning" | "afternoon">("morning");
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
  const [halfDeductTitle, setHalfDeductTitle] = useState("");
  const [halfDeductAmount, setHalfDeductAmount] = useState("");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("16:00");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key,value")
        .in("key", ["start_time", "end_time"]);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => (map[r.key] = r.value));
      if (map.start_time) setWorkStart(map.start_time);
      if (map.end_time) setWorkEnd(map.end_time);
    })();
  }, []);



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
      ? (supabase.rpc("list_staff_directory") as any).then((r: any) => ({
          data: (r.data as any[] | null)?.filter((p) => p.role === "staff" || p.role === "assistant") ?? [],
        }))
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
        const { data: profiles } = await (supabase.rpc("list_staff_directory") as any);
        const nameMap: Record<string, string> = {};
        (profiles as any[])?.filter((p: any) => userIds.includes(p.id))
          .forEach((p: any) => (nameMap[p.id] = p.full_name));

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

  // Map server-side guard exceptions to friendly Burmese messages
  const friendlyLeaveError = (msg: string): string => {
    if (msg.includes("OFF_DAY")) return "သင်၏ Off Day အပေါ်တွင် Leave Request တင်လို့ မရပါ။";
    if (msg.includes("DUPLICATE")) return "တရက်တည်းအတွက် တူညီသော Leave ကို နှစ်ကြိမ် ယူ၍ မရပါ။";
    if (msg.includes("FULL_LEAVE_EXISTS")) return "ထို နေ့အတွက် Full Leave ရထားသဖြင့် Partial Leave တင်လို့ မရပါ။";
    if (msg.includes("OVERLAP_PARTIAL")) return "အချိန် တိုက်ဆိုင်နေသော Partial Leave ရှိနေပါသည်။";
    if (msg.includes("OVERLAP_HALF")) return "Approve ရထားသော Half-Leave အချိန်နှင့် တိုက်ဆိုင်နေပါသည်။";
    if (msg.includes("INVALID_TIME")) return "Partial Leave အတွက် Start/End အချိန် မှန်ကန်စွာ ထည့်ပါ။";
    if (msg.includes("MONTHLY_LIMIT_FULL")) return "တလအတွင်း Full Leave (၂)ကြိမ်ထက် ပိုပြီး ယူ၍ မရပါ။";
    if (msg.includes("MONTHLY_LIMIT_HALF")) return "တလအတွင်း Half Leave (၄)ကြိမ်ထက် ပိုပြီး ယူ၍ မရပါ။";
    if (msg.includes("MONTHLY_LIMIT")) return "တလအတွင်း ခွင့်ရက် ကန့်သတ် ကျော်လွန်နေပါသည်။";
    return msg;
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
        half_period: type === "half_leave" ? halfPeriod : null,
      };
      const { error } = await supabase.from("leave_requests").insert(payload);

      if (error) {
        toast({ title: "Failed to submit", description: friendlyLeaveError(error.message), variant: "destructive" });
      } else {
        toast({ title: "Leave request submitted successfully ✓" });
        const typeText =
          type === "half_leave"
            ? `${halfPeriodLabel(halfPeriod)}`
            : TYPE_LABEL[type];
        notifyAdmins(
          "New leave request",
          `${profile?.full_name ?? "Staff"} requested ${typeText} on ${date}`,
          "/leave",
        );
        setDate("");
        setReason("");
        setType("leave");
        setHalfPeriod("morning");
        setStartTime("");
        setEndTime("");
        loadData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Monthly leave equivalent (Full=1, Half=0.5) already approved for the user
  // of the selected request, excluding the request itself.
  const monthlyApprovedEquiv = (() => {
    if (!selectedRequest) return 0;
    const monthPrefix = selectedRequest.date.slice(0, 7);
    return allRequests
      .filter(
        (r) =>
          r.user_id === selectedRequest.user_id &&
          r.id !== selectedRequest.id &&
          r.date.startsWith(monthPrefix) &&
          r.status === "approved" &&
          (r.type === "leave" || r.type === "half_leave"),
      )
      .reduce((sum, r) => sum + (r.type === "leave" ? 1 : 0.5), 0);
  })();
  const fullLeaveOverCap =
    !!selectedRequest && selectedRequest.type === "leave" && monthlyApprovedEquiv >= 2;
  // Manual deduction is only required when the system AUTO-submitted the half-leave
  // (reason prefixed with "[AUTO]"). Staff-submitted half-leaves approve directly
  // and lose -0.5 from balance via the apply_leave_balance_change trigger.
  const isAutoSubmitted =
    !!selectedRequest && (selectedRequest.reason ?? "").startsWith("[AUTO]");

  const handleReview = async (
    requestId: string,
    decision: "approved" | "rejected",
  ) => {
    if (!user || !selectedRequest) return;

    const needsManualDeduction =
      decision === "approved" &&
      ((selectedRequest.type === "half_leave" && isAutoSubmitted) || fullLeaveOverCap);


    if (needsManualDeduction) {
      const amt = parseInt(halfDeductAmount, 10);
      if (!halfDeductTitle.trim() || !Number.isFinite(amt) || amt <= 0) {
        toast({
          title: "Manual deduction required",
          description: fullLeaveOverCap
            ? "လအတွင်း ခွင့်ရက် (၂)ရက် ကျော်လွန်နေသဖြင့် Description နှင့် Amount ဖြည့်ပါ။"
            : "Half Leave အတွက် Description နှင့် Amount ဖြည့်ပါ။",
          variant: "destructive",
        });
        return;
      }
      setReviewingId(requestId);
      try {
        const monthStart = `${selectedRequest.date.slice(0, 7)}-01`;
        const { error: dedErr } = await (supabase as any)
          .from("salary_manual_deductions")
          .insert({
            user_id: selectedRequest.user_id,
            month: monthStart,
            title: halfDeductTitle.trim(),
            amount: amt,
            source: fullLeaveOverCap ? "leave_over_cap" : "half_leave",
            created_by: user.id,
          });
        if (dedErr) {
          toast({ title: "Deduction failed", description: dedErr.message, variant: "destructive" });
          return;
        }
        const { error } = await supabase
          .from("leave_requests")
          .update({
            status: "approved",
            reviewed_by: user.id,
            reviewed_at: new Date().toISOString(),
            payment_type: "paid",
          })
          .eq("id", requestId);
        if (error) {
          toast({ title: "Review failed", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: fullLeaveOverCap ? "Leave approved (manual deduction) ✓" : "Half Leave approved ✓" });
        sendPush({
          user_ids: [selectedRequest.user_id],
          title: fullLeaveOverCap ? "Leave approved — Manual Deduction" : "Half Leave approved",
          body: `${halfDeductTitle.trim()} — ${amt.toLocaleString()} Ks deducted`,
          url: "/salary",
        });
        // Afternoon Half-Leave approval shifts check-out to 12:00 PM — notify all parties.
        if (
          selectedRequest.type === "half_leave" &&
          selectedRequest.half_period === "afternoon"
        ) {
          notifyAdmins(
            "Afternoon Half-Leave approved",
            `${selectedRequest.profile_name ?? "Staff"} ၏ check-out time သည် ${selectedRequest.date} နေ့အတွက် 12:00 PM သို့ ပြောင်းသွားပါပြီ။`,
            "/leave",
          );
          sendPush({
            user_ids: [selectedRequest.user_id],
            title: "Check-out time updated",
            body: "Afternoon Half-Leave approved. သင်၏ Check-out time သည် 12:00 PM သို့ ပြောင်းသွားပါပြီ။",
            url: "/attendance",
          });
        }
        setSelectedRequest(null);
        setHalfDeductTitle("");
        setHalfDeductAmount("");
        loadData();
      } finally {
        setReviewingId(null);
      }
      return;
    }

    setReviewingId(requestId);
    try {
      const updates: any = {
        status: decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        payment_type: decision === "approved" ? "paid" : null,
      };
      const { error } = await supabase
        .from("leave_requests")
        .update(updates)
        .eq("id", requestId);

      if (error) {
        toast({ title: "Review failed", description: error.message, variant: "destructive" });
        return;
      }

      // Partial Leave approval → auto-create a salary transaction (minutes × per-min rate)
      if (
        decision === "approved" &&
        selectedRequest.type === "partial_leave" &&
        selectedRequest.start_time &&
        selectedRequest.end_time
      ) {
        try {
          const [sh, sm] = selectedRequest.start_time.slice(0, 5).split(":").map(Number);
          const [eh, em] = selectedRequest.end_time.slice(0, 5).split(":").map(Number);
          const minutes = Math.max(0, eh * 60 + em - (sh * 60 + sm));
          const { data: rates } = await (supabase.rpc("get_user_rates", { p_user_id: selectedRequest.user_id }) as any);
          const rateRow = Array.isArray(rates) ? rates[0] : rates;
          const rate =
            Number((rateRow as any)?.partial_leave_deduction_per_minute) ||
            Number((rateRow as any)?.deduction_rate_per_minute) ||
            200;
          const amount = minutes * rate;
          if (amount > 0) {
            const monthStart = `${selectedRequest.date.slice(0, 7)}-01`;
            await (supabase as any).from("salary_manual_deductions").insert({
              user_id: selectedRequest.user_id,
              month: monthStart,
              title: `Partial Leave (${selectedRequest.date} ${selectedRequest.start_time.slice(0,5)}–${selectedRequest.end_time.slice(0,5)}, ${minutes} min)`,
              amount,
              source: "partial_leave",
              created_by: user.id,
            });
            sendPush({
              user_ids: [selectedRequest.user_id],
              title: "Partial Leave approved",
              body: `${minutes} min × ${rate.toLocaleString()} Ks = ${amount.toLocaleString()} Ks deducted`,
              url: "/salary",
            });
          }
        } catch (e) {
          console.error("[partial-leave] deduction insert failed", e);
        }
      }

      toast({
        title: decision === "approved" ? "Leave approved ✓" : "Leave request rejected",
      });

      // Morning Half-Leave approval shifts check-in to 12:00 PM — notify all parties.
      if (
        decision === "approved" &&
        selectedRequest.type === "half_leave" &&
        selectedRequest.half_period === "morning"
      ) {
        notifyAdmins(
          "Morning Half-Leave approved",
          `${selectedRequest.profile_name ?? "Staff"} ၏ check-in time သည် ${selectedRequest.date} နေ့အတွက် 12:00 PM သို့ ပြောင်းသွားပါပြီ။`,
          "/leave",
        );
      }
      sendPush({
        user_ids: [selectedRequest.user_id],
        title: decision === "approved" ? "Leave approved" : "Leave rejected",
        body:
          decision === "approved"
            ? selectedRequest.type === "half_leave" && selectedRequest.half_period === "morning"
              ? `Morning Half-Leave approved. သင်၏ Check-in time သည် 12:00 PM သို့ ပြောင်းသွားပါပြီ။`
              : `Your ${TYPE_LABEL[selectedRequest.type]} on ${selectedRequest.date} was approved.`
            : `Your ${TYPE_LABEL[selectedRequest.type]} on ${selectedRequest.date} was rejected.`,
        url: "/leave",
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
              halfPeriod={halfPeriod} setHalfPeriod={setHalfPeriod}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime}
              onSubmit={handleSubmit}
              submitting={submitting}
              existingRequests={myRequests}
              workStart={workStart}
              workEnd={workEnd}

            />
          </SectionBlock>

          <SectionBlock label="3 · My Leave Logs" hint="Status of your past requests.">
            <MyRequestsList requests={myRequests} statusBadge={statusBadge} />
          </SectionBlock>

          <SectionBlock label="4 · Overtime Requests" hint="Submit overtime for time already worked. Cannot be future.">
            <OvertimeSection />
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

          <SectionBlock label="D · Overtime Requests" hint="Review staff overtime. Approval auto-adds salary.">
            <OvertimeSection />
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
                halfPeriod={halfPeriod} setHalfPeriod={setHalfPeriod}
                startTime={startTime} setStartTime={setStartTime}
                endTime={endTime} setEndTime={setEndTime}
                onSubmit={handleSubmit}
                submitting={submitting}
                existingRequests={myRequests}
                workStart={workStart}
                workEnd={workEnd}

              />
            </SectionBlock>
            <SectionBlock label="3 · My Leave Logs" hint="Status of your past requests.">
              <MyRequestsList requests={myRequests} statusBadge={statusBadge} />
            </SectionBlock>
            <SectionBlock label="4 · Overtime Requests" hint="Submit overtime for time already worked.">
              <OvertimeSection />
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
            <SectionBlock label="B · Overtime Requests" hint="Review staff overtime. Approval auto-adds salary.">
              <OvertimeSection />
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
                  <span className="font-medium">
                    {TYPE_LABEL[selectedRequest.type]}
                    {selectedRequest.type === "half_leave" && selectedRequest.half_period && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({halfPeriodLabel(selectedRequest.half_period)})
                      </span>
                    )}
                  </span>
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
              {selectedRequest.status === "pending" &&
                ((selectedRequest.type === "half_leave" && isAutoSubmitted) || fullLeaveOverCap) && (

                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Manual Deduction (required to approve)
                  </p>
                  {fullLeaveOverCap && (
                    <p className="text-xs text-warning">
                      လအတွင်း ခွင့်ရက် (၂)ရက် ကျော်လွန်နေပါပြီ — Description နှင့် Amount ထည့်ပါ။
                    </p>
                  )}
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={halfDeductTitle}
                      onChange={(e) => setHalfDeductTitle(e.target.value)}
                      placeholder={fullLeaveOverCap ? "e.g. Over-cap leave deduction" : "e.g. Half-Leave deduction"}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Amount (Ks)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={halfDeductAmount}
                      onChange={(e) => setHalfDeductAmount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
              {selectedRequest.status === "pending" && (() => {
                const financialRequest =
                  (selectedRequest.type === "half_leave" && isAutoSubmitted) || fullLeaveOverCap;

                if (isAssistant && financialRequest) {
                  return (
                    <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning-foreground">
                      Admin approval required. Assistant Admin သည် Financial Statement ပါသော Request များကို Approve / Reject လုပ်ခွင့် မရှိပါ။
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      onClick={() => handleReview(selectedRequest.id, "approved")}
                      disabled={reviewingId === selectedRequest.id}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.98] transition-transform"
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
                      className="border-destructive text-destructive hover:bg-destructive/10 active:scale-[0.98] transition-transform"
                    >
                      {reviewingId === selectedRequest.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><XCircle className="h-4 w-4 mr-2" /> Reject</>
                      )}
                    </Button>
                  </div>
                );
              })()}
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
  halfPeriod, setHalfPeriod,
  startTime, setStartTime, endTime, setEndTime,
  onSubmit, submitting, existingRequests,
  workStart, workEnd,
}: {
  date: string; setDate: (v: string) => void;
  reason: string; setReason: (v: string) => void;
  type: LeaveType; setType: (v: LeaveType) => void;
  halfPeriod: "morning" | "afternoon"; setHalfPeriod: (v: "morning" | "afternoon") => void;
  startTime: string; setStartTime: (v: string) => void;
  endTime: string; setEndTime: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  existingRequests: LeaveRequest[];
  workStart: string;
  workEnd: string;
}) {
  const dayName = date ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Yangon" }).format(new Date(`${date}T00:00:00+06:30`)) : "";
  const isPartial = type === "partial_leave";
  const isHalf = type === "half_leave";

  const DUPLICATE_MSG = "သင်၏ ခွင့်ချိန် ခွင့်ရက်များကို (2)ကြိမ်မြောက် တူညီစွာ ယူလို့ မရပါ။";

  // Duplicate detection (ignore rejected requests)
  const activeOnDate = date
    ? existingRequests.filter((r) => r.date === date && r.status !== "rejected")
    : [];

  const fullLeaveDuplicate =
    type === "leave" && activeOnDate.some((r) => r.type === "leave");

  const halfLeaveDuplicate =
    isHalf && activeOnDate.some((r) => r.type === "half_leave" && (r.half_period ?? "") === halfPeriod);

  // Block Partial Leave when an approved Full Leave exists for that day
  const partialBlockedByFull =
    isPartial && activeOnDate.some((r) => r.type === "leave" && r.status === "approved");

  // Block Partial Leave when it overlaps an approved Half-Leave window
  const partialBlockedByHalf =
    isPartial && startTime && endTime
      ? activeOnDate.some(
          (r) =>
            r.type === "half_leave" &&
            r.status === "approved" &&
            ((r.half_period === "morning" && startTime < "12:00") ||
              (r.half_period === "afternoon" && endTime > "12:00")),
        )
      : false;

  // Partial Leave must sit inside the official work window
  const partialOutOfWindow =
    isPartial && startTime && endTime
      ? startTime < workStart || endTime > workEnd
      : false;

  const partialOverlap =
    isPartial && startTime && endTime && startTime < endTime
      ? activeOnDate.some(
          (r) =>
            r.type === "partial_leave" &&
            r.start_time &&
            r.end_time &&
            startTime < r.end_time.slice(0, 5) &&
            endTime > r.start_time.slice(0, 5),
        )
      : false;

  const hasDuplicate =
    fullLeaveDuplicate ||
    partialOverlap ||
    halfLeaveDuplicate ||
    partialBlockedByFull ||
    partialBlockedByHalf ||
    partialOutOfWindow;

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
                <RadioGroupItem value="half_leave" id="half_leave" />
                <Label htmlFor="half_leave" className="cursor-pointer">Half Leave</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="partial_leave" id="partial_leave" />
                <Label htmlFor="partial_leave" className="cursor-pointer">Partial Leave</Label>
              </div>
            </RadioGroup>
            {isHalf && (
              <div className="mt-3 pl-1">
                <Label className="mb-1.5 block text-xs text-muted-foreground">Half-Leave Period</Label>
                <RadioGroup
                  value={halfPeriod}
                  onValueChange={(v) => setHalfPeriod(v as "morning" | "afternoon")}
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="morning" id="hp-morning" />
                    <Label htmlFor="hp-morning" className="cursor-pointer">Morning Half-Leave</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="afternoon" id="hp-afternoon" />
                    <Label htmlFor="hp-afternoon" className="cursor-pointer">Afternoon Half-Leave</Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground mt-2">
                  Half Leave က ခွင့်လက်ကျန်ရက်မှ (၀.၅)ရက် နှုတ်ပါမည်။ Admin Approve သည့်အခါ Manual Deduction ထည့်ပါမည်။
                </p>
              </div>
            )}
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
            {(fullLeaveDuplicate || halfLeaveDuplicate) && (
              <p className="text-xs text-destructive mt-1.5 font-medium">{DUPLICATE_MSG}</p>
            )}
          </div>
          {isPartial && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start time</Label>
                <Input type="time" min={workStart} max={workEnd} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End time</Label>
                <Input type="time" min={workStart} max={workEnd} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Work window: {workStart} – {workEnd}. Partial Leave အချိန် ဤအတွင်းသာ ဖြစ်ရမည်။
              </p>
              {partialOverlap && (
                <p className="col-span-2 text-xs text-destructive font-medium">{DUPLICATE_MSG}</p>
              )}
              {partialBlockedByFull && (
                <p className="col-span-2 text-xs text-destructive font-medium">
                  ထို နေ့အတွက် Full Leave Approve ရထားသဖြင့် Partial Leave ယူ၍ မရပါ။
                </p>
              )}
              {partialBlockedByHalf && (
                <p className="col-span-2 text-xs text-destructive font-medium">
                  Approve ရထားသော Half-Leave အချိန်နှင့် တိုက်ဆိုင်နေပါသည်။
                </p>
              )}
              {partialOutOfWindow && (
                <p className="col-span-2 text-xs text-destructive font-medium">
                  သတ်မှတ်ထားသော Work Window ({workStart} – {workEnd}) အပြင် မထွက်ရပါ။
                </p>
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
                type === "half_leave" ? "Reason for half leave" :
                "Reason for partial leave"
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
                    {req.type === "half_leave" && req.half_period && (
                      <span className="text-xs text-muted-foreground">{halfPeriodLabel(req.half_period)}</span>
                    )}
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
                      {req.type === "half_leave" && req.half_period && (
                        <span className="text-xs text-muted-foreground">{halfPeriodLabel(req.half_period)}</span>
                      )}
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
