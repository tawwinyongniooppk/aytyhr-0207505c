import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { sendPush } from "@/lib/push";
import { Loader2, MinusCircle, Trash2, Inbox } from "lucide-react";

interface ManualDeduction {
  id: string;
  user_id: string;
  title: string;
  reason: string;
  days: number;
  created_by: string;
  created_at: string;
  staff_name?: string;
}

export function ManualDeductionPanel({
  staffList,
}: {
  staffList: { id: string; full_name: string }[];
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [list, setList] = useState<ManualDeduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState<string>("1");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const nameMap: Record<string, string> = Object.fromEntries(
    staffList.map((s) => [s.id, s.full_name])
  );

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leave_manual_deductions")
      .select("*")
      .order("created_at", { ascending: false });
    setList(
      (data ?? []).map((d: any) => ({ ...d, staff_name: nameMap[d.user_id] || "Unknown" }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffList.length]);

  const daysNum = Number(days);
  const isValid = userId && title.trim() && Number.isFinite(daysNum) && daysNum > 0;

  const submit = async () => {
    if (!isValid || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("leave_manual_deductions").insert({
        user_id: userId,
        title: title.trim(),
        reason: reason.trim(),
        days: daysNum,
        created_by: user.id,
      });
      if (error) {
        toast({ title: "Failed to apply", description: error.message, variant: "destructive" });
      } else {
        toast({ title: `Manual deduction applied (-${daysNum} day${daysNum > 1 ? "s" : ""})` });
        // Notify the affected staff member
        sendPush({
          user_ids: [userId],
          title: "Manual Deduction Applied",
          body: `${title.trim()} — ${daysNum} day${daysNum > 1 ? "s" : ""} deducted${reason.trim() ? ` (${reason.trim()})` : ""}`,
          url: "/salary",
        });
        setUserId(""); setTitle(""); setReason(""); setDays("1");
        setConfirmOpen(false);
        load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string, d: number) => {
    const { error } = await supabase.from("leave_manual_deductions").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Deduction removed (+${d} day${d > 1 ? "s" : ""} restored)` });
      load();
    }
  };

  return (
    <Card className="border border-border shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-display flex items-center gap-2">
          <MinusCircle className="h-4 w-4 text-destructive" /> Manual Leave Deduction
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Apply when a staff member exceeds the automatic 2-leaves-per-month cap. Only deducts on confirm.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Staff member</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name || "Unnamed"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Days to deduct</Label>
            <Input type="number" min={1} step={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Title / Reason</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Excess leave – June" />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Additional context" />
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              disabled={!isValid || submitting}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MinusCircle className="h-4 w-4 mr-2" />}
              Apply Manual Deduction
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm manual deduction</AlertDialogTitle>
              <AlertDialogDescription>
                Deduct <b>{daysNum}</b> day{daysNum > 1 ? "s" : ""} from{" "}
                <b>{nameMap[userId] || "this staff"}</b>'s leave balance. This is saved as a separate record.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={submit}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="pt-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Recent manual deductions</p>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-1">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No manual deductions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {list.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{d.staff_name}</p>
                      <Badge variant="secondary" className="text-xs">-{d.days}d</Badge>
                    </div>
                    <p className="text-xs mt-0.5">{d.title}</p>
                    {d.reason && <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(d.created_at).toLocaleString()}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(d.id, d.days)} title="Remove (refunds balance)">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
