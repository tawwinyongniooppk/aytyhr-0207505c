import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Clock, CheckCircle, XCircle, Loader2, Inbox, Filter, Timer, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { sendPush, notifyAdmins } from "@/lib/push";
import { formatMMTDateTime, getMMTDateParts } from "@/lib/mmt";

interface OvertimeRequest {
  id: string;
  user_id: string;
  title: string;
  description: string;
  reason: string;
  start_at: string;
  end_at: string;
  status: "pending" | "approved" | "rejected";
  minutes: number;
  rate_per_minute: number;
  amount: number;
  reviewed_at: string | null;
  created_at: string;
  profile_name?: string;
}

function diffMinutes(startISO: string, endISO: string) {
  const s = new Date(startISO).getTime();
  const e = new Date(endISO).getTime();
  return Math.max(0, Math.round((e - s) / 60000));
}

function nowLocalDatetimeInputValue() {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export function OvertimeSection() {
  const { user } = useAuth();
  const { profile, isAdmin, isAssistant, isStaff } = useProfile();
  const { toast } = useToast();

  const canManage = isAdmin || isAssistant;
  const canSubmit = isStaff || isAssistant;

  const [myItems, setMyItems] = useState<OvertimeRequest[]>([]);
  const [allItems, setAllItems] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<OvertimeRequest | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [filterStaff, setFilterStaff] = useState("all");
  const [staffList, setStaffList] = useState<{ id: string; full_name: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, isAssistant, isStaff]);

  async function load() {
    setLoading(true);
    const myP = canSubmit
      ? supabase.from("overtime_requests").select("*").eq("user_id", user!.id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] });
    const allP = canManage
      ? supabase.from("overtime_requests").select("*").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] });
    const staffP = canManage
      ? (supabase.rpc("list_staff_directory") as any).then((r: any) => ({
          data: (r.data as any[] | null)?.filter((p) => p.role === "staff" || p.role === "assistant") ?? [],
        }))
      : Promise.resolve({ data: [] as any[] });

    const [my, all, staff] = await Promise.all([myP, allP, staffP]);
    if (my.data) setMyItems(my.data as any);
    if (staff.data) setStaffList((staff.data as any[]).map((p) => ({ id: p.id, full_name: p.full_name })));

    if (canManage && all.data) {
      const rows = all.data as any[];
      const uids = [...new Set(rows.map((r) => r.user_id))];
      let nameMap: Record<string, string> = {};
      if (uids.length) {
        const { data: profs } = await (supabase.rpc("list_staff_directory") as any);
        (profs as any[])?.filter((p) => uids.includes(p.id)).forEach((p) => (nameMap[p.id] = p.full_name));
      }
      setAllItems(rows.map((r) => ({ ...r, profile_name: nameMap[r.user_id] || "Unknown" })));
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim() || !description.trim() || !reason.trim() || !startAt || !endAt) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    const startISO = new Date(startAt).toISOString();
    const endISO = new Date(endAt).toISOString();
    const now = Date.now();
    if (new Date(startISO).getTime() > now || new Date(endISO).getTime() > now) {
      toast({
        title: "Future time not allowed",
        description: "Overtime can only be requested for time that has already passed.",
        variant: "destructive",
      });
      return;
    }
    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      toast({ title: "Invalid time range", description: "End time must be after start time.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("overtime_requests").insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim(),
        reason: reason.trim(),
        start_at: startISO,
        end_at: endISO,
        status: "pending",
      });
      if (error) {
        toast({ title: "Submit failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Overtime request submitted ✓" });
      notifyAdmins(
        "New overtime request",
        `${profile?.full_name ?? "Staff"} requested OT: ${title.trim()}`,
        "/leave",
      );
      setTitle(""); setDescription(""); setReason(""); setStartAt(""); setEndAt("");
      void load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(item: OvertimeRequest, decision: "approved" | "rejected") {
    if (!user) return;
    setReviewingId(item.id);
    try {
      let updates: any = {
        status: decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      };
      let amount = 0;
      let minutes = 0;

      if (decision === "approved") {
        const { data: rates } = await (supabase.rpc("get_user_rates", { p_user_id: item.user_id }) as any);
        const rateRow = Array.isArray(rates) ? rates[0] : rates;
        const rate = (rateRow as any)?.overtime_rate_per_minute ?? 200;
        minutes = diffMinutes(item.start_at, item.end_at);
        amount = minutes * rate;
        updates = { ...updates, minutes, rate_per_minute: rate, amount };
      }

      const { error } = await supabase.from("overtime_requests").update(updates).eq("id", item.id);
      if (error) {
        toast({ title: "Review failed", description: error.message, variant: "destructive" });
        return;
      }

      if (decision === "approved" && amount > 0) {
        const parts = getMMTDateParts(item.start_at);
        const monthStart = `${parts.year}-${parts.month}-01`;
        const { error: addErr } = await supabase.from("salary_manual_additions").insert({
          user_id: item.user_id,
          created_by: user.id,
          month: monthStart,
          title: `Overtime Payment: ${item.title}`,
          amount,
          kind: "auto",
        });
        if (addErr) {
          toast({ title: "Salary addition failed", description: addErr.message, variant: "destructive" });
        }
      }

      toast({
        title: decision === "approved" ? `OT approved — +${amount.toLocaleString()} MMK` : "OT rejected",
      });

      sendPush({
        user_ids: [item.user_id],
        title: decision === "approved" ? "Overtime approved" : "Overtime rejected",
        body:
          decision === "approved"
            ? `${item.title} — +${amount.toLocaleString()} MMK (${minutes} min) added to your salary.`
            : `${item.title} — your overtime request was rejected.`,
        url: "/leave",
      });

      setSelected(null);
      void load();
    } finally {
      setReviewingId(null);
    }
  }

  const filteredAdmin = useMemo(() => {
    return allItems
      .filter((r) => {
        if (filterStatus !== "all" && r.status !== filterStatus) return false;
        if (filterStaff !== "all" && r.user_id !== filterStaff) return false;
        return true;
      })
      .sort((a, b) => {
        const at = new Date(a.reviewed_at || a.created_at).getTime();
        const bt = new Date(b.reviewed_at || b.created_at).getTime();
        return bt - at;
      });
  }, [allItems, filterStatus, filterStaff]);

  const statusBadge = (s: string) => {
    const map: Record<string, { cls: string; icon: React.ReactNode }> = {
      approved: { cls: "bg-accent/10 text-accent", icon: <CheckCircle className="h-3.5 w-3.5" /> },
      rejected: { cls: "bg-destructive/10 text-destructive", icon: <XCircle className="h-3.5 w-3.5" /> },
      pending: { cls: "bg-warning/10 text-warning", icon: <Clock className="h-3.5 w-3.5" /> },
    };
    const c = map[s] ?? map.pending;
    return (
      <Badge variant="secondary" className={`text-xs flex items-center gap-1 ${c.cls}`}>
        {c.icon}
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Submit form */}
      {canSubmit && (
        <Card className="border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" /> New Overtime Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Overtime can only be requested <span className="font-medium">after</span> the work has been done.
              Future or upcoming times are not allowed.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Evening session preparation" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>From</Label>
                  <Input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    max={nowLocalDatetimeInputValue()}
                  />
                </div>
                <div>
                  <Label>To</Label>
                  <Input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    max={nowLocalDatetimeInputValue()}
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What did you work on?"
                  rows={2}
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why overtime was needed"
                  rows={2}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 active:scale-[0.98] transition-transform"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  <><Timer className="h-4 w-4 mr-2" /> Submit Overtime</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* My OT logs */}
      {canSubmit && (
        <Card className="border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-display">My Overtime Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {myItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Inbox className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No overtime requests yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myItems.map((r) => (
                  <div key={r.id} className="py-2 border-b border-border last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatMMTDateTime(r.start_at)} → {formatMMTDateTime(r.end_at)}
                        </p>
                      </div>
                      {statusBadge(r.status)}
                    </div>
                    {r.status === "approved" && r.amount > 0 && (
                      <p className="text-xs text-accent mt-1">+{r.amount.toLocaleString()} MMK ({r.minutes} min)</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin/Assistant review list */}
      {canManage && (
        <Card className="border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-base font-display">Staff Overtime Requests ({filteredAdmin.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 flex-wrap mb-4">
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
            </div>

            {filteredAdmin.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Inbox className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No overtime requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAdmin.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{r.profile_name} — {r.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatMMTDateTime(r.start_at)} → {formatMMTDateTime(r.end_at)}
                      </p>
                      {r.status === "approved" && r.amount > 0 && (
                        <p className="text-xs text-accent mt-0.5">+{r.amount.toLocaleString()} MMK</p>
                      )}
                    </div>
                    {statusBadge(r.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Review Overtime</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Staff</span><span className="font-medium">{selected.profile_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span className="font-medium">{selected.title}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">From</span><span className="font-medium">{formatMMTDateTime(selected.start_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-medium">{formatMMTDateTime(selected.end_at)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{diffMinutes(selected.start_at, selected.end_at)} min</span></div>
              <div>
                <span className="text-muted-foreground">Description</span>
                <p className="mt-1 p-2 bg-muted rounded">{selected.description}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Reason</span>
                <p className="mt-1 p-2 bg-muted rounded">{selected.reason}</p>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status</span>
                {statusBadge(selected.status)}
              </div>
              {selected.status === "pending" && (
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button
                    onClick={() => handleReview(selected, "approved")}
                    disabled={reviewingId === selected.id}
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {reviewingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><CheckCircle className="h-4 w-4 mr-2" /> Approve</>)}
                  </Button>
                  <Button
                    onClick={() => handleReview(selected, "rejected")}
                    disabled={reviewingId === selected.id}
                    variant="outline"
                    className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                  >
                    {reviewingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><XCircle className="h-4 w-4 mr-2" /> Reject</>)}
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
