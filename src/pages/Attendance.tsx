import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Clock, AlertTriangle, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface AttendanceRecord {
  id: string;
  check_in_time: string | null;
  check_out_time: string | null;
  late_minutes: number;
  early_minutes: number;
}

interface Settings {
  start_time: string;
  end_time: string;
  grace_period_minutes: number;
  deduction_rate_per_minute: number;
}

const DEFAULT_SETTINGS: Settings = {
  start_time: "09:00",
  end_time: "16:00",
  grace_period_minutes: 10,
  deduction_rate_per_minute: 200,
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

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    const [attRes, settRes] = await Promise.all([
      supabase
        .from("attendance")
        .select("*")
        .eq("user_id", user!.id)
        .eq("date", today)
        .maybeSingle(),
      supabase.from("app_settings").select("*"),
    ]);

    if (attRes.data) setRecord(attRes.data as unknown as AttendanceRecord);

    if (settRes.data) {
      const map: Record<string, string> = {};
      (settRes.data as unknown as { key: string; value: string }[]).forEach((r) => (map[r.key] = r.value));
      setSettings({
        start_time: map.start_time ?? DEFAULT_SETTINGS.start_time,
        end_time: map.end_time ?? DEFAULT_SETTINGS.end_time,
        grace_period_minutes: Number(map.grace_period_minutes) || DEFAULT_SETTINGS.grace_period_minutes,
        deduction_rate_per_minute: Number(map.deduction_rate_per_minute) || DEFAULT_SETTINGS.deduction_rate_per_minute,
      });
    }
    setLoading(false);
  };

  const handleCheckIn = async () => {
    if (!user) return;
    const now = new Date();
    const lateMin = calcLateMinutes(now, settings.start_time, settings.grace_period_minutes);
    const today = now.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("attendance")
      .insert({
        user_id: user.id,
        date: today,
        check_in_time: now.toISOString(),
        late_minutes: lateMin,
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
    } else {
      setRecord(data as unknown as AttendanceRecord);
      toast({ title: lateMin > 0 ? `Checked in (${lateMin} min late)` : "Checked in on time ✓" });
    }
  };

  const handleCheckOut = async () => {
    if (!user || !record) return;
    const now = new Date();
    const earlyMin = calcEarlyMinutes(now, settings.end_time);

    const { data, error } = await supabase
      .from("attendance")
      .update({
        check_out_time: now.toISOString(),
        early_minutes: earlyMin,
      } as any)
      .eq("id", record.id)
      .select()
      .single();

    if (error) {
      toast({ title: "Check-out failed", description: error.message, variant: "destructive" });
    } else {
      setRecord(data as unknown as AttendanceRecord);
      toast({ title: earlyMin > 0 ? `Checked out (${earlyMin} min early)` : "Checked out ✓" });
    }
  };

  const checkedIn = !!record?.check_in_time;
  const checkedOut = !!record?.check_out_time;
  const lateDeduction = (record?.late_minutes ?? 0) * settings.deduction_rate_per_minute;
  const earlyDeduction = (record?.early_minutes ?? 0) * settings.deduction_rate_per_minute;
  const totalDeduction = lateDeduction + earlyDeduction;

  const formatTime = (iso: string | null) => {
    if (!iso) return "--:--";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold font-display">Attendance</h1></div>
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">Mark your attendance for today</p>
      </div>

      {/* Status Card */}
      <Card className="border border-border shadow-none">
        <CardContent className="p-6 text-center space-y-4">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-muted mx-auto">
            <Clock className="h-8 w-8 text-secondary" />
          </div>

          <div>
            <p className="text-sm text-muted-foreground">Current Status</p>
            <p className={`text-lg font-bold font-display mt-1 ${checkedIn ? "text-accent" : "text-muted-foreground"}`}>
              {checkedOut ? "Day Complete ✓" : checkedIn ? "Present ✓" : "Not Checked In"}
            </p>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              onClick={handleCheckIn}
              disabled={checkedIn}
              className="bg-accent text-accent-foreground hover:bg-accent/90 active:animate-press"
            >
              <LogIn className="h-4 w-4 mr-2" /> Check In
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={!checkedIn || checkedOut}
              variant="outline"
              className="active:animate-press"
            >
              <LogOut className="h-4 w-4 mr-2" /> Check Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Time Details */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-border shadow-none">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Check-in</p>
            <p className="text-lg font-bold font-display mt-1">{formatTime(record?.check_in_time ?? null)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-none">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Check-out</p>
            <p className="text-lg font-bold font-display mt-1">{formatTime(record?.check_out_time ?? null)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Late / Early */}
      {(record?.late_minutes ?? 0) > 0 || (record?.early_minutes ?? 0) > 0 ? (
        <Card className="border border-destructive/30 shadow-none">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-display font-semibold text-sm">Attendance Issues</span>
            </div>
            {(record?.late_minutes ?? 0) > 0 && (
              <p className="text-sm text-muted-foreground">
                Late by <span className="font-semibold text-foreground">{record!.late_minutes} minutes</span>
              </p>
            )}
            {(record?.early_minutes ?? 0) > 0 && (
              <p className="text-sm text-muted-foreground">
                Left early by <span className="font-semibold text-foreground">{record!.early_minutes} minutes</span>
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Deduction Preview */}
      {totalDeduction > 0 && (
        <Card className="border border-border shadow-none">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-secondary" />
              <span className="font-display font-semibold text-sm">Deduction Preview</span>
            </div>
            <div className="space-y-1 text-sm">
              {lateDeduction > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Late ({record!.late_minutes} min × {settings.deduction_rate_per_minute} kyats)</span>
                  <span className="font-medium">{lateDeduction.toLocaleString()} kyats</span>
                </div>
              )}
              {earlyDeduction > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Early leave ({record!.early_minutes} min × {settings.deduction_rate_per_minute} kyats)</span>
                  <span className="font-medium">{earlyDeduction.toLocaleString()} kyats</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-border font-semibold">
                <span>Total Deduction</span>
                <span className="text-destructive">{totalDeduction.toLocaleString()} kyats</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
