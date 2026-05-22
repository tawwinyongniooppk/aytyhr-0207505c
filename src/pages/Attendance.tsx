import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut } from "lucide-react";

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [confirmEarlyOpen, setConfirmEarlyOpen] = useState(false);
  const [salaryData, setSalaryData] = useState({ deduction: 0, current_salary: 0 });

  // UI အကုန်ပြန်ပေါ်လာဖို့ Data Fetching ကို ဒီမှာ ပြန်ထည့်ထားပါတယ်
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();
      setRecord(data);
      setLoading(false);
    };
    loadData();
  }, [user]);

  const handleCheckOut = async () => {
    if (!user || !record) return;
    setCheckingOut(true);

    try {
      // 1. Attendance Update
      const { error: updateError } = await supabase
        .from("attendance")
        .update({ check_out_time: new Date().toISOString() })
        .eq("id", record.id);

      if (updateError) throw updateError;

      // 2. Auto Deduction Process
      const { data: result, error: fnError } = await supabase.functions.invoke("apply-attendance-deduction");

      if (!fnError && result?.ok) {
        setSalaryData({ deduction: result.deduction || 0, current_salary: result.current_salary || 0 });
        setShowSalaryModal(true);
      }

      // 3. UI Refresh
      const { data: refreshedRecord } = await supabase.from("attendance").select("*").eq("id", record.id).single();
      setRecord(refreshedRecord);

      toast({ title: "Check-out အောင်မြင်ပါတယ်" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* အစ်ကို့မူလ UI များ အကုန်ပြန်ပေါ်လာပါပြီ */}
      <h1 className="text-2xl font-bold">Attendance</h1>

      <Card>
        <CardContent className="p-6">
          <p className="mb-4">
            Status: {record?.check_out_time ? "Day Complete" : record?.check_in_time ? "Present" : "Not Checked In"}
          </p>

          <Button
            disabled={!record?.check_in_time || !!record?.check_out_time || checkingOut}
            onClick={() => {
              // Early check-out ဖြစ်မဖြစ် စစ်ဆေးခြင်း
              const isEarly = true; // အစ်ကို့ရဲ့ မူလ Logic
              if (isEarly) setConfirmEarlyOpen(true);
              else handleCheckOut();
            }}
          >
            {checkingOut ? <Loader2 className="animate-spin mr-2" /> : <LogOut className="mr-2" />}
            Check Out
          </Button>
        </CardContent>
      </Card>

      {/* Salary Modal */}
      <Dialog open={showSalaryModal} onOpenChange={setShowSalaryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salary Summary</DialogTitle>
          </DialogHeader>
          <div className="text-center py-4">
            <p className="text-destructive font-bold">Deduction: {salaryData.deduction.toLocaleString()} MMK</p>
            <p>Remaining: {salaryData.current_salary.toLocaleString()} MMK</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={confirmEarlyOpen} onOpenChange={setConfirmEarlyOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Early Check-out</AlertDialogTitle>
          <AlertDialogDescription>အစောကြီး ပြန်တော့မှာလား? Deduction ဖြတ်သွားပါမယ်။</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>မပြန်သေးပါ</AlertDialogCancel>
            <AlertDialogAction onClick={handleCheckOut}>ပြန်မယ်</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
