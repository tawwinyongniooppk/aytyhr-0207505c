import { useState } from "react";
import { Card } from "@/components/ui/card";
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

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [checkingOut, setCheckingOut] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [confirmEarlyOpen, setConfirmEarlyOpen] = useState(false);
  const [salaryData, setSalaryData] = useState({ deduction: 0, current_salary: 0 });

  const handleCheckOut = async () => {
    if (!user) return;
    setCheckingOut(true);

    try {
      // 1. Attendance update
      const { error: updateError } = await supabase
        .from("attendance")
        .update({ check_out_time: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("check_out_time", null); // ဒီနေ့အတွက် check_out မလုပ်ရသေးတာကို ရှာပြီး update

      if (updateError) throw updateError;

      // 2. Deduction Process (Edge Function Call)
      const { data: result, error: fnError } = await supabase.functions.invoke("apply-attendance-deduction");

      if (fnError) throw fnError;

      if (result?.ok) {
        setSalaryData({
          deduction: result.deduction || 0,
          current_salary: result.current_salary || 0,
        });
        setShowSalaryModal(true);
      }

      toast({ title: "Check-out အောင်မြင်ပါတယ်" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button
        onClick={() => {
          // အစောပြန်ခြင်းကို စစ်ဆေးပြီး Confirm Dialog ပြမယ်
          const isEarly = true; // အစ်ကို့ရဲ့ logic နဲ့ တွက်ချက်ထားသည့်အတိုင်း
          if (isEarly) setConfirmEarlyOpen(true);
          else handleCheckOut();
        }}
        disabled={checkingOut}
      >
        {checkingOut ? "Processing..." : "Check Out"}
      </Button>

      {/* Salary Result Modal */}
      <Dialog open={showSalaryModal} onOpenChange={setShowSalaryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Day Summary</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-destructive font-bold text-lg">
              ဖြတ်ခံရသည့်ငွေ: {salaryData.deduction.toLocaleString()} MMK
            </p>
            <p className="mt-4">ကျန်ရှိသည့်လစာ: {salaryData.current_salary.toLocaleString()} MMK</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Early Checkout Confirmation */}
      <AlertDialog open={confirmEarlyOpen} onOpenChange={setConfirmEarlyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Early Check-out</AlertDialogTitle>
            <AlertDialogDescription>
              အစောကြီး ပြန်တော့မှာလား? Deduction ဖြတ်သွားပါမယ် သေချာပါသလား?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>မပြန်သေးပါ</AlertDialogCancel>
            <AlertDialogAction onClick={handleCheckOut}>သေချာပါတယ်</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
