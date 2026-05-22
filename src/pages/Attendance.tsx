import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LogIn,
  LogOut,
  Clock,
  AlertTriangle,
  DollarSign,
  Wallet,
  MapPin,
  ShieldCheck,
  ShieldX,
  RefreshCw,
  Loader2,
  Volume2,
} from "lucide-react";
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

interface AttendanceRecord {
  id: string;
  check_in_time: string | null;
  check_out_time: string | null;
  late_minutes: number;
  early_minutes: number;
  deduction_applied: boolean;
}

interface Settings {
  start_time: string;
  end_time: string;
  grace_period_minutes: number;
  deduction_rate_per_minute: number;
  school_latitude: number;
  school_longitude: number;
  allowed_radius_meters: number;
}

interface SalaryRecord {
  base_salary: number;
  current_salary: number;
  total_deductions: number;
}

interface LocationState {
  status: "idle" | "loading" | "granted" | "denied" | "error";
  lat: number | null;
  lng: number | null;
  distance: number | null;
  isInside: boolean | null;
  errorMessage: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  start_time: "09:00",
  end_time: "16:00",
  grace_period_minutes: 10,
  deduction_rate_per_minute: 200,
  school_latitude: 0,
  school_longitude: 0,
  allowed_radius_meters: 50,
};

function calcLateMinutes(checkInTime: Date, startTime: string, gracePeriod: number): number {
  const [h, m] = startTime.split(":").map(Number);
  const threshold = new Date(checkInTime);
  threshold.setHours(h, m + gracePeriod, 0, 0);
  const diff = Math.floor((checkInTime.getTime() - threshold.getTime()) / 60000);
  return Math.max(0, diff);
}

function calcEarlyMinutes(checkOutTime: Date, endTime: string): number {
  const [h, m] = endTime.split(":").map(Number);
  const end = new Date(checkOutTime);
  end.setHours(h, m, 0, 0);
  const diff = Math.floor((end.getTime() - checkOutTime.getTime()) / 60000);
  return Math.max(0, diff);
}

function getMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function playAlertSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.warn("Audio playback failed:", e);
  }
}

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [salary, setSalary] = useState<SalaryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [confirmEarlyOpen, setConfirmEarlyOpen] = useState(false);
  const [lastDeduction, setLastDeduction] = useState(0);
  const [fullName, setFullName] = useState<string>("");
  const [checkOutNotice, setCheckOutNotice] = useState<string | null>(null);
  const [checkInNotice, setCheckInNotice] = useState<string | null>(null);
  const [salaryNotification, setSalaryNotification] = useState<{ remaining: number; deduction: number } | null>(null);
  const [location, setLocation] = useState<LocationState>({
    status: "idle",
    lat: null,
    lng: null,
    distance: null,
    isInside: null,
    errorMessage: null,
  });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const monthStart = getMonthStart();
    const [attRes, settRes, salRes, profileRes] = await Promise.all([
      supabase.from("attendance").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle(),
      supabase.from("app_settings").select("*"),
      supabase.from("salaries").select("*").eq("user_id", user!.id).eq("month", monthStart).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle(),
    ]);
    if (attRes.data) setRecord(attRes.data as unknown as AttendanceRecord);
    if (salRes.data) setSalary(salRes.data as unknown as SalaryRecord);
    if (profileRes.data) setFullName((profileRes.data as any).full_name ?? "");
    if (settRes.data) {
      const map: any = {};
      (settRes.data as any[]).forEach((r) => (map[r.key] = r.value));
      setSettings({ ...DEFAULT_SETTINGS, ...map });
    }
    setLoading(false);
  }

  const handleCheckOut = async () => {
    if (!user || !record || checkingOut) return;
    setCheckingOut(true);

    const now = new Date();
    // တွက်ချက်ပြီး early_minutes နဲ့ check_out_time ကို update လုပ်မယ်
    const earlyMin = calcEarlyMinutes(now, settings.end_time);

    const { data, error } = await supabase
      .from("attendance")
      .update({ check_out_time: now.toISOString(), early_minutes: earlyMin })
      .eq("id", record.id)
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setCheckingOut(false);
      return;
    }

    setRecord(data as unknown as AttendanceRecord);

    // Deduction ဖြစ်စဉ်ကို အလိုအလျောက်ခေါ်ယူခြင်း
    const { data: result, error: fnErr } = await supabase.functions.invoke("apply-attendance-deduction");

    if (!fnErr && result?.ok) {
      setSalary({
        base_salary: result.base_salary,
        current_salary: result.current_salary,
        total_deductions: result.total_deductions,
      });
      setLastDeduction(result.deduction ?? 0);
      setShowSalaryModal(true);
      showSalaryNotification(result.current_salary, result.deduction ?? 0);
    }

    setCheckingOut(false);
    setCheckOutNotice("Checked out successfully");
    toast({ title: "Checked out successfully" });
  };

  const showSalaryNotification = (remaining: number, deduction: number) => {
    setSalaryNotification({ remaining, deduction });
    playAlertSound();
    setTimeout(() => setSalaryNotification(null), 8000);
  };

  const checkedIn = !!record?.check_in_time;
  const checkedOut = !!record?.check_out_time;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Attendance</h1>

      {/* UI Code များ */}
      <Card className="p-6">
        <p>Status: {checkedOut ? "Done" : checkedIn ? "Present" : "Not In"}</p>
        <div className="flex gap-4 mt-4">
          <Button
            disabled={checkedIn}
            onClick={() => {
              /* Check In Logic */
            }}
          >
            Check In
          </Button>
          <Button
            disabled={!checkedIn || checkedOut}
            onClick={() => {
              const early = calcEarlyMinutes(new Date(), settings.end_time);
              if (early > 0) setConfirmEarlyOpen(true);
              else handleCheckOut();
            }}
          >
            {checkingOut ? "..." : "Check Out"}
          </Button>
        </div>
      </Card>

      {/* Salary Summary Modal */}
      <Dialog open={showSalaryModal} onOpenChange={setShowSalaryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Summary</DialogTitle>
          </DialogHeader>
          <p>Deduction: {lastDeduction.toLocaleString()} MMK</p>
          <p>New Salary: {(salary?.current_salary ?? 0).toLocaleString()} MMK</p>
        </DialogContent>
      </Dialog>

      {/* Early Alert */}
      <AlertDialog open={confirmEarlyOpen} onOpenChange={setConfirmEarlyOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Early Check-out</AlertDialogTitle>
          <AlertDialogDescription>အစောကြီး ပြန်တော့မှာလား?</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>မပြန်သေးပါ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmEarlyOpen(false);
                handleCheckOut();
              }}
            >
              ပြန်မယ်
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
