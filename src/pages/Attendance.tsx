import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogIn, LogOut, Clock, AlertTriangle, DollarSign, Wallet, MapPin, ShieldCheck, ShieldX, RefreshCw, Loader2, Volume2 } from "lucide-react";
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
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
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
  const [lastDeduction, setLastDeduction] = useState(0);
  const [userRole, setUserRole] = useState<string>("staff");
  const [staffWorkDay, setStaffWorkDay] = useState<string>("");
  const [staffCheckInTime, setStaffCheckInTime] = useState<string>("");
  const [staffCheckOutTime, setStaffCheckOutTime] = useState<string>("");
  const [checkOutNotice, setCheckOutNotice] = useState<string | null>(null);
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

  useEffect(() => {
    if (settings.school_latitude !== 0 || settings.school_longitude !== 0) {
      getLocation();
    }
  }, [settings.school_latitude, settings.school_longitude]);

  const getLocation = useCallback(() => {
    try {
      if (!navigator.geolocation) {
        setLocation((prev) => ({ ...prev, status: "error", errorMessage: "Geolocation not supported by your browser" }));
        return;
      }

      setLocation((prev) => ({ ...prev, status: "loading", errorMessage: null }));

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const schoolConfigured = settings.school_latitude !== 0 || settings.school_longitude !== 0;
            let distance: number | null = null;
            let isInside: boolean | null = null;

            if (schoolConfigured) {
              distance = Math.round(haversineDistance(lat, lng, settings.school_latitude, settings.school_longitude));
              isInside = distance <= settings.allowed_radius_meters;
            }

            setLocation({ status: "granted", lat, lng, distance, isInside, errorMessage: null });
          } catch (e) {
            console.error("Location calculation error:", e);
            setLocation({ status: "error", lat: null, lng: null, distance: null, isInside: null, errorMessage: "Unable to verify location, please try again" });
          }
        },
        (err) => {
          console.warn("Geolocation denied:", err.message);
          const msg = err.code === 1 ? "Location permission is required. Please enable location access in your browser settings." : err.code === 3 ? "Location request timed out" : "Unable to get location";
          setLocation({ status: "denied", lat: null, lng: null, distance: null, isInside: null, errorMessage: msg });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    } catch (e) {
      console.error("getLocation unexpected error:", e);
      setLocation({ status: "error", lat: null, lng: null, distance: null, isInside: null, errorMessage: "Unable to verify location, please try again" });
    }
  }, [settings.school_latitude, settings.school_longitude, settings.allowed_radius_meters]);

  const requestLocationPermission = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setLocation(prev => ({ ...prev, status: "error", errorMessage: "Geolocation not supported" }));
        resolve(false);
        return;
      }
      setLocation(prev => ({ ...prev, status: "loading", errorMessage: null }));
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
          setLocation({ status: "granted", lat, lng, distance, isInside, errorMessage: null });
          resolve(true);
        },
        (err) => {
          const msg = err.code === 1 ? "Location permission is required. Please enable location access in your browser settings." : "Unable to get location";
          setLocation({ status: "denied", lat: null, lng: null, distance: null, isInside: null, errorMessage: msg });
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];
      const monthStart = getMonthStart();

      const [attRes, settRes, salRes, profileRes] = await Promise.all([
        supabase.from("attendance").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle(),
        supabase.from("app_settings").select("*"),
        supabase.from("salaries").select("*").eq("user_id", user!.id).eq("month", monthStart).maybeSingle(),
        supabase.from("profiles").select("role, work_day, check_in_time").eq("id", user!.id).maybeSingle(),
      ]);

      if (attRes.data) setRecord(attRes.data as unknown as AttendanceRecord);
      if (salRes.data) setSalary(salRes.data as unknown as SalaryRecord);
      if (profileRes.error) {
        console.error("[Attendance] profile fetch error:", profileRes.error);
      }
      if (profileRes.data) {
        const p = profileRes.data as any;
        setUserRole(p.role ?? "staff");
        setStaffWorkDay(p.work_day ?? "");
        setStaffCheckInTime(p.check_in_time ?? "");
        console.log("[Attendance] loaded staff schedule:", {
          user_id: user!.id,
          work_day: p.work_day,
          check_in_time: p.check_in_time,
        });
      }

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
    } catch (e) {
      console.error("loadData error:", e);
      toast({ title: "Failed to load data", description: "Please refresh the page", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const ensureSalaryRecord = async (): Promise<SalaryRecord> => {
    try {
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
    } catch (e) {
      console.error("ensureSalaryRecord error:", e);
      return { base_salary: 300000, current_salary: 300000, total_deductions: 0 };
    }
  };

  const schoolConfigured = settings.school_latitude !== 0 || settings.school_longitude !== 0;
  const isAdmin = userRole === "admin";

  // Today's expected check-in time per staff schedule.
  // Rule: IF today == staff.work_day → use staff's custom check_in_time
  //       ELSE → use global default (settings.start_time)
  const todayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const isSpecialDay = !!staffWorkDay && staffWorkDay === todayName;
  const expectedCheckInTime =
    isSpecialDay && staffCheckInTime ? staffCheckInTime : settings.start_time;
  const geoBlocked = schoolConfigured && location.status === "granted" && location.isInside === false;
  const geoDenied = location.status === "denied";
  const geoError = location.status === "error";
  const geoLoading = location.status === "loading";

  const canCheckIn = (() => {
    if (record?.check_in_time) return false;
    if (!schoolConfigured) return true;
    if (location.isInside === true) return true;
    if ((geoDenied || geoError) && isAdmin) return true;
    return false;
  })();

  const getLocationStatusLabel = (): string => {
    if (!schoolConfigured) return "";
    if (location.isInside === true) return "inside";
    if (location.isInside === false) return "outside";
    if (geoDenied) return "denied";
    if (geoError) return "error";
    if (geoLoading) return "loading";
    return "unknown";
  };

  const showSalaryNotification = (remaining: number, deduction: number) => {
    setSalaryNotification({ remaining, deduction });
    playAlertSound();
    setTimeout(() => setSalaryNotification(null), 8000);
  };

  const handleCheckIn = async () => {
    if (!user || checkingIn) return;

    try {
      setCheckingIn(true);

      // Always request location permission on check-in
      if (schoolConfigured && location.status !== "granted") {
        const granted = await requestLocationPermission();
        if (!granted && !isAdmin) {
          toast({ title: "Location permission is required", description: "Please enable location access to check in.", variant: "destructive" });
          setCheckingIn(false);
          return;
        }
      }

      // Re-check after location request
      const currentLocation = location;
      if (schoolConfigured && currentLocation.isInside === false && !isAdmin) {
        toast({ title: "Outside school area", description: `You are ${currentLocation.distance}m away. Move closer to check in.`, variant: "destructive" });
        setCheckingIn(false);
        return;
      }

      if (schoolConfigured && (currentLocation.status === "denied" || currentLocation.status === "error") && !isAdmin) {
        toast({ title: "Location permission is required", description: "Please enable location access for attendance", variant: "destructive" });
        setCheckingIn(false);
        return;
      }

      const now = new Date();
      const effectiveStartTime = expectedCheckInTime;

      console.log("[Attendance] check-in time resolution:", {
        today: todayName,
        staffWorkDay,
        staffCheckInTime,
        defaultStartTime: settings.start_time,
        isSpecialDay,
        effectiveStartTime,
      });

      const lateMin = calcLateMinutes(now, effectiveStartTime, settings.grace_period_minutes);
      const today = now.toISOString().split("T")[0];
      const locationStatus = getLocationStatusLabel();

      const insertData: any = {
        user_id: user.id,
        date: today,
        check_in_time: now.toISOString(),
        late_minutes: lateMin,
        deduction_applied: false,
        location_status: locationStatus || null,
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

        const overrideNote = (geoDenied || geoError) && isAdmin ? " (Admin override)" : "";
        toast({ title: lateMin > 0 ? `Checked in (${lateMin} min late)${overrideNote}` : `Checked in on time ✓${overrideNote}` });

        // Show salary notification after check-in
        const estimatedDeduction = lateMin * settings.deduction_rate_per_minute;
        showSalaryNotification(sal.current_salary, estimatedDeduction);
      }
    } catch (e) {
      console.error("handleCheckIn error:", e);
      toast({ title: "Check-in failed", description: "An unexpected error occurred. Please try again.", variant: "destructive" });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    if (!user || !record || checkingOut) return;

    try {
      setCheckingOut(true);

      // Request location for check-out too
      if (schoolConfigured && location.status !== "granted") {
        await requestLocationPermission();
      }

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

      let finalDeduction = 0;

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
          finalDeduction = deduction;
          showSalaryNotification(newCurrent, deduction);
        } else {
          await supabase.from("attendance").update({ deduction_applied: true } as any).eq("id", record.id);
          setRecord({ ...updatedRecord, deduction_applied: true });
          setSalary(sal);
          setLastDeduction(0);
          showSalaryNotification(sal.current_salary, 0);
        }
        setShowSalaryModal(true);
      }

      const excuseNote = hasApprovedLeave ? " (Leave approved)" : hasApprovedLateExcuse ? " (Late excused)" : "";
      toast({ title: earlyMin > 0 ? `Checked out (${earlyMin} min early)${excuseNote}` : `Checked out ✓${excuseNote}` });
    } catch (e) {
      console.error("handleCheckOut error:", e);
      toast({ title: "Check-out failed", description: "An unexpected error occurred. Please try again.", variant: "destructive" });
    } finally {
      setCheckingOut(false);
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
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">Mark your attendance for today</p>
      </div>

      {/* Salary Notification Banner */}
      {salaryNotification && (
        <Card className="border-2 border-secondary shadow-md bg-secondary/5 animate-in fade-in slide-in-from-top-2 duration-300">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-secondary" />
              <span className="font-display font-semibold text-sm text-secondary">Salary Notification</span>
            </div>
            <p className="text-sm">
              ယခုလအတွက် သင့်ရဲ့ လစာလက်ကျန်မှာ <span className="font-bold text-secondary">{salaryNotification.remaining.toLocaleString()} MMK</span> ဖြစ်ပါသည်။
            </p>
            <p className="text-sm">
              ယနေ့အတွက် သင့်လစာဖြတ်ခံရသည့် ပမာဏမှာ <span className="font-bold text-destructive">{salaryNotification.deduction.toLocaleString()} MMK</span> ဖြစ်ပါသည်။
            </p>
          </CardContent>
        </Card>
      )}

      {/* Location Status Card */}
      {schoolConfigured && (
        <Card className={`border shadow-none ${
          location.isInside === true ? "border-accent/30 bg-accent/5" :
          location.isInside === false ? "border-destructive/30 bg-destructive/5" :
          geoError ? "border-destructive/30 bg-destructive/5" :
          "border-border"
        }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {geoLoading ? (
                <>
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display">Checking location...</p>
                    <p className="text-xs text-muted-foreground">Getting your GPS position</p>
                  </div>
                </>
              ) : geoDenied ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display">Location permission denied</p>
                    <p className="text-xs text-muted-foreground">
                      {isAdmin ? "Admin override available — check-in allowed without location" : "Location permission is required. Please enable it in your browser settings."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && <Badge className="bg-secondary text-secondary-foreground text-[10px]">Admin</Badge>}
                    <Button size="sm" variant="outline" onClick={getLocation}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Retry
                    </Button>
                  </div>
                </>
              ) : geoError ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display text-destructive">Location error</p>
                    <p className="text-xs text-muted-foreground">{location.errorMessage || "Unable to verify location, please try again"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && <Badge className="bg-secondary text-secondary-foreground text-[10px]">Admin</Badge>}
                    <Button size="sm" variant="outline" onClick={getLocation}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Retry
                    </Button>
                  </div>
                </>
              ) : location.isInside === true ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-accent" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display text-accent">Inside school area</p>
                    <p className="text-xs text-muted-foreground">{location.distance}m from school (allowed: {settings.allowed_radius_meters}m)</p>
                  </div>
                  <Badge className="bg-accent/10 text-accent border-accent/30 text-[10px]">Inside</Badge>
                </>
              ) : location.isInside === false ? (
                <>
                  <ShieldX className="h-5 w-5 text-destructive" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display text-destructive">Outside school area</p>
                    <p className="text-xs text-muted-foreground">{location.distance}m away (max: {settings.allowed_radius_meters}m)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-[10px]">Outside</Badge>
                    <Button size="sm" variant="outline" onClick={getLocation}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display">Location not available</p>
                    <p className="text-xs text-muted-foreground">Tap to get your current location</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={getLocation}>
                    <MapPin className="h-3 w-3 mr-1" /> Get Location
                  </Button>
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
              disabled={!canCheckIn || checkingIn || geoLoading}
              className="bg-accent text-accent-foreground hover:bg-accent/90 active:animate-press"
            >
              {checkingIn ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
              Check In
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={!checkedIn || checkedOut || checkingOut}
              variant="outline"
              className="active:animate-press"
            >
              {checkingOut ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
              Check Out
            </Button>
          </div>
          {schoolConfigured && !canCheckIn && !checkedIn && !geoLoading && (
            <p className="text-xs text-destructive">
              {geoBlocked ? "Move inside school area to check in" :
               (geoDenied || geoError) && !isAdmin ? "Location permission is required to check in" :
               ""}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Time Details */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border border-border shadow-none">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Check-in</p>
            <p className="text-lg font-bold font-display mt-1">{formatTime(record?.check_in_time ?? null)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Expected: {expectedCheckInTime}{isSpecialDay ? " (your day)" : ""}
            </p>
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
            <div className="pt-2 text-xs text-muted-foreground space-y-1">
              <p>ယခုလအတွက် သင့်ရဲ့ လစာလက်ကျန်မှာ <span className="font-semibold">{(salary?.current_salary ?? 0).toLocaleString()} MMK</span> ဖြစ်ပါသည်။</p>
              <p>ယနေ့အတွက် သင့်လစာဖြတ်ခံရသည့် ပမာဏမှာ <span className="font-semibold">{lastDeduction.toLocaleString()} MMK</span> ဖြစ်ပါသည်။</p>
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
