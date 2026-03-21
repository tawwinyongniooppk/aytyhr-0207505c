import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Clock, AlertTriangle, DollarSign, Wallet, MapPin, ShieldCheck, ShieldX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [salary, setSalary] = useState<SalaryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [lastDeduction, setLastDeduction] = useState(0);
  const [location, setLocation] = useState<LocationState>({
    status: "idle",
    lat: null,
    lng: null,
    distance: null,
    isInside: null,
  });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  // Get location on mount
  useEffect(() => {
    getLocation();
  }, [settings.school_latitude]);

  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocation((prev) => ({ ...prev, status: "error" }));
      return;
    }

    setLocation((prev) => ({ ...prev, status: "loading" }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const schoolConfigured = settings.school_latitude !== 0 || settings.school_longitude !== 0;
        let distance: number | null = null;
        let isInside: boolean | null = null;

        if (schoolConfigured) {
          distance = Math.round(haversineDistance(lat, lng, settings.school_latitude, settings.school_longitude));
          isInside = distance <= settings.allowed_radius_meters;
        }

        setLocation({ status: "granted", lat, lng, distance, isInside });
      },
      () => {
        setLocation({ status: "denied", lat: null, lng: null, distance: null, isInside: null });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const loadData = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const monthStart = getMonthStart();

    const [attRes, settRes, salRes] = await Promise.all([
      supabase.from("attendance").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle(),
      supabase.from("app_settings").select("*"),
      supabase.from("salaries").select("*").eq("user_id", user!.id).eq("month", monthStart).maybeSingle(),
    ]);

    if (attRes.data) setRecord(attRes.data as unknown as AttendanceRecord);
    if (salRes.data) setSalary(salRes.data as unknown as SalaryRecord);

    if (settRes.data) {
      const map: Record<string, string> = {};
      (settRes.data as unknown as { key: string; value: string }[]).forEach((r) => (map[r.key] = r.value));
      setSettings({
        start_time: map.start_time ?? DEFAULT_SETTINGS.start_time,
        end_time: map.end_time ?? DEFAULT_SETTINGS.end_time,
        grace_period_minutes: Number(map.grace_period_minutes) || DEFAULT_SETTINGS.grace_period_minutes,
        deduction_rate_per_minute: Number(map.deduction_rate_per_minute) || DEFAULT_SETTINGS.deduction_rate_per_minute,
        school_latitude: Number(map.school_latitude) || 0,
        school_longitude: Number(map.school_longitude) || 0,
        allowed_radius_meters: Number(map.allowed_radius_meters) || DEFAULT_SETTINGS.allowed_radius_meters,
      });
    }
    setLoading(false);
  };

  const ensureSalaryRecord = async (): Promise<SalaryRecord> => {
    const monthStart = getMonthStart();
    const { data: existing } = await supabase
      .from("salaries").select("*").eq("user_id", user!.id).eq("month", monthStart).maybeSingle();
    if (existing) return existing as unknown as SalaryRecord;

    const { data: profile } = await supabase
      .from("profiles").select("base_salary").eq("id", user!.id).single();
    const baseSalary = (profile as any)?.base_salary ?? 300000;

    const { data: newRec } = await supabase
      .from("salaries")
      .insert({ user_id: user!.id, month: monthStart, base_salary: baseSalary, current_salary: baseSalary, total_deductions: 0 } as any)
      .select().single();

    return (newRec as unknown as SalaryRecord) ?? { base_salary: baseSalary, current_salary: baseSalary, total_deductions: 0 };
  };

  const schoolConfigured = settings.school_latitude !== 0 || settings.school_longitude !== 0;
  const geoBlocked = schoolConfigured && location.status === "granted" && location.isInside === false;
  const geoDenied = location.status === "denied";

  const handleCheckIn = async () => {
    if (!user) return;

    // Re-check location before check-in
    if (schoolConfigured && location.status !== "denied") {
      if (geoBlocked) {
        toast({ title: "Outside school area", description: `You are ${location.distance}m away. Move closer to check in.`, variant: "destructive" });
        return;
      }
    }

    const now = new Date();
    const lateMin = calcLateMinutes(now, settings.start_time, settings.grace_period_minutes);
    const today = now.toISOString().split("T")[0];

    const insertData: any = {
      user_id: user.id,
      date: today,
      check_in_time: now.toISOString(),
      late_minutes: lateMin,
      deduction_applied: false,
    };

    if (location.lat != null) {
      insertData.check_in_lat = location.lat;
      insertData.check_in_lng = location.lng;
      insertData.check_in_distance = location.distance;
    }

    const { data, error } = await supabase
      .from("attendance").insert(insertData).select().single();

    if (error) {
      toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
    } else {
      setRecord(data as unknown as AttendanceRecord);
      const sal = await ensureSalaryRecord();
      setSalary(sal);
      toast({ title: lateMin > 0 ? `Checked in (${lateMin} min late)` : "Checked in on time ✓" });
    }
  };

  const handleCheckOut = async () => {
    if (!user || !record) return;
    const now = new Date();
    const earlyMin = calcEarlyMinutes(now, settings.end_time);
    const today = now.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("attendance")
      .update({ check_out_time: now.toISOString(), early_minutes: earlyMin } as any)
      .eq("id", record.id).select().single();

    if (error) {
      toast({ title: "Check-out failed", description: error.message, variant: "destructive" });
      return;
    }

    const updatedRecord = data as unknown as AttendanceRecord;
    setRecord(updatedRecord);

    const { data: approvedLeave } = await supabase
      .from("leave_requests").select("type")
      .eq("user_id", user.id).eq("date", today).eq("status", "approved");

    const approvedTypes = (approvedLeave as any[] | null)?.map((r: any) => r.type) ?? [];
    const hasApprovedLeave = approvedTypes.includes("leave");
    const hasApprovedLateExcuse = approvedTypes.includes("late_excuse");

    if (!updatedRecord.deduction_applied) {
      const effectiveLateMin = hasApprovedLeave || hasApprovedLateExcuse ? 0 : (updatedRecord.late_minutes ?? 0);
      const effectiveEarlyMin = hasApprovedLeave ? 0 : earlyMin;
      const totalMinutes = effectiveLateMin + effectiveEarlyMin;
      const deduction = totalMinutes * settings.deduction_rate_per_minute;
      const sal = await ensureSalaryRecord();

      if (deduction > 0) {
        const newCurrent = Math.max(0, sal.current_salary - deduction);
        const newDeductions = sal.total_deductions + deduction;
        await supabase.from("salaries").update({ current_salary: newCurrent, total_deductions: newDeductions, last_updated: new Date().toISOString() } as any)
          .eq("user_id", user.id).eq("month", getMonthStart());
        await supabase.from("attendance").update({ deduction_applied: true } as any).eq("id", record.id);
        setRecord({ ...updatedRecord, deduction_applied: true });
        setSalary({ ...sal, current_salary: newCurrent, total_deductions: newDeductions });
        setLastDeduction(deduction);
      } else {
        await supabase.from("attendance").update({ deduction_applied: true } as any).eq("id", record.id);
        setRecord({ ...updatedRecord, deduction_applied: true });
        setSalary(sal);
        setLastDeduction(0);
      }
      setShowSalaryModal(true);
    }

    const excuseNote = hasApprovedLeave ? " (Leave approved)" : hasApprovedLateExcuse ? " (Late excused)" : "";
    toast({ title: earlyMin > 0 ? `Checked out (${earlyMin} min early)${excuseNote}` : `Checked out ✓${excuseNote}` });
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

      {/* Location Status Card */}
      {schoolConfigured && (
        <Card className={`border shadow-none ${
          location.isInside === true ? "border-accent/30 bg-accent/5" :
          location.isInside === false ? "border-destructive/30 bg-destructive/5" :
          "border-border"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {location.status === "loading" ? (
                <>
                  <MapPin className="h-5 w-5 text-muted-foreground animate-pulse" />
                  <div>
                    <p className="text-sm font-semibold font-display">Checking location...</p>
                    <p className="text-xs text-muted-foreground">Getting your GPS position</p>
                  </div>
                </>
              ) : location.status === "denied" ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display">Location permission denied</p>
                    <p className="text-xs text-muted-foreground">Check-in allowed but location won't be recorded</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={getLocation}>Retry</Button>
                </>
              ) : location.isInside === true ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-semibold font-display text-accent">Inside school area ✓</p>
                    <p className="text-xs text-muted-foreground">{location.distance}m from school (allowed: {settings.allowed_radius_meters}m)</p>
                  </div>
                </>
              ) : location.isInside === false ? (
                <>
                  <ShieldX className="h-5 w-5 text-destructive" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display text-destructive">Outside school area</p>
                    <p className="text-xs text-muted-foreground">{location.distance}m away (max: {settings.allowed_radius_meters}m)</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={getLocation}>Refresh</Button>
                </>
              ) : (
                <>
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display">Location not available</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={getLocation}>Get Location</Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Salary Summary */}
      {salary && (
        <Card className="border border-secondary/30 shadow-none bg-secondary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-secondary" />
              <span className="font-display font-semibold text-sm">Your Salary This Month</span>
            </div>
            <p className="text-2xl font-bold font-display text-secondary">
              {salary.current_salary.toLocaleString()} kyats
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Base: {salary.base_salary.toLocaleString()} · Deducted: {salary.total_deductions.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      )}

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
              disabled={checkedIn || (geoBlocked && !geoDenied)}
              className="bg-accent text-accent-foreground hover:bg-accent/90 active:animate-press"
            >
              <LogIn className="h-4 w-4 mr-2" /> Check In
            </Button>
            <Button onClick={handleCheckOut} disabled={!checkedIn || checkedOut} variant="outline" className="active:animate-press">
              <LogOut className="h-4 w-4 mr-2" /> Check Out
            </Button>
          </div>
          {geoBlocked && !geoDenied && !checkedIn && (
            <p className="text-xs text-destructive">Move inside school area to check in</p>
          )}
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

      {/* Deduction Breakdown */}
      {totalDeduction > 0 && (
        <Card className="border border-border shadow-none">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-secondary" />
              <span className="font-display font-semibold text-sm">
                Deduction {record?.deduction_applied ? "(Applied)" : "(Preview)"}
              </span>
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

      {/* Salary Modal after checkout */}
      <Dialog open={showSalaryModal} onOpenChange={setShowSalaryModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-center">Day Summary</DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-4 py-4">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-secondary/10 mx-auto">
              <Wallet className="h-7 w-7 text-secondary" />
            </div>
            {lastDeduction > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">Today's deduction</p>
                <p className="text-xl font-bold text-destructive">-{lastDeduction.toLocaleString()} kyats</p>
              </>
            ) : (
              <p className="text-sm text-accent font-medium">No deductions today ✓</p>
            )}
            <div className="pt-3 border-t border-border">
              <p className="text-sm text-muted-foreground">Remaining Salary</p>
              <p className="text-2xl font-bold font-display text-secondary">
                {(salary?.current_salary ?? 0).toLocaleString()} kyats
              </p>
            </div>
            <Button onClick={() => setShowSalaryModal(false)} className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
