import { useState, useEffect, useCallback, useRef } from "react";
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
  Eye,
  EyeOff,
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
import { getMMTMonthStartISO, getMMTTodayISO } from "@/lib/mmt";
import { notifyAdmins } from "@/lib/push";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";

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

// Myanmar Standard Time (UTC+6:30) — use server-independent time math so
// device-clock timezone bugs cannot produce wrong late/early minutes.
const YANGON_OFFSET_MIN = 6 * 60 + 30;

function yangonNowMinutes(): number {
  const d = new Date();
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (utcMin + YANGON_OFFSET_MIN + 24 * 60) % (24 * 60);
}

function hhmmToMinutes(s: string): number {
  if (!s) return 0;
  const [h, m] = s.split(":").map((v) => Number(v));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function calcLateMinutes(startTime: string, gracePeriod: number): number {
  return Math.max(0, yangonNowMinutes() - (hhmmToMinutes(startTime) + gracePeriod));
}

function calcEarlyMinutes(endTime: string): number {
  return Math.max(0, hhmmToMinutes(endTime) - yangonNowMinutes());
}

function formatTime12h(hhmm: string): string {
  if (!hhmm) return "";
  const [hStr, mStr = "0"] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function getMonthStart(): string {
  return getMMTMonthStartISO();
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
  const [salaryHidden, setSalaryHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("att_salary_hidden") !== "0";
  });
  const toggleSalaryVisibility = () => {
    setSalaryHidden((prev) => {
      const next = !prev;
      try { window.localStorage.setItem("att_salary_hidden", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [confirmEarlyOpen, setConfirmEarlyOpen] = useState(false);
  const [lastDeduction, setLastDeduction] = useState(0);
  const [userRole, setUserRole] = useState<string>("staff");
  const [fullName, setFullName] = useState<string>("");
  const [staffWorkDay, setStaffWorkDay] = useState<string>("");
  const [staffCheckInTime, setStaffCheckInTime] = useState<string>("");
  const [staffCheckOutTime, setStaffCheckOutTime] = useState<string>("");
  const [workSchedule, setWorkSchedule] = useState<Record<
    string,
    { active: boolean; check_in: string; check_out: string }
  > | null>(null);
  const [checkOutNotice, setCheckOutNotice] = useState<string | null>(null);
  const [checkInNotice, setCheckInNotice] = useState<string | null>(null);
  const [salaryNotification, setSalaryNotification] = useState<{ remaining: number; deduction: number } | null>(null);
  const [isHolidayToday, setIsHolidayToday] = useState(false);
  const [hasFullLeaveToday, setHasFullLeaveToday] = useState(false);
  const [hasMorningHalfLeaveToday, setHasMorningHalfLeaveToday] = useState(false);
  const [hasAfternoonHalfLeaveToday, setHasAfternoonHalfLeaveToday] = useState(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [location, setLocation] = useState<LocationState>({
    status: "idle",
    lat: null,
    lng: null,
    distance: null,
    isInside: null,
    errorMessage: null,
  });

  // (Initial + per-MMT-date load lives in the mmtDate effect below.)

  // Lightweight polling (60s) instead of a realtime channel — keeps DB compute
  // low on the free tier. Pauses when the tab is hidden, refreshes on focus.
  useEffect(() => {
    if (!user) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id != null) return;
      id = setInterval(() => {
        if (!document.hidden) loadHolidayAndLeave();
      }, 60_000);
    };
    const stop = () => {
      if (id != null) { clearInterval(id); id = null; }
    };
    const onVis = () => {
      if (document.hidden) { stop(); }
      else { loadHolidayAndLeave(); start(); }
    };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user]);

  // Tick every minute so 6 AM gating + end-of-day boundary update without
  // a refresh. When the MMT calendar date rolls over (midnight), automatically
  // reload attendance so the page flips to the new day.
  const [mmtDate, setMmtDate] = useState<string>(getMMTTodayISO());
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setNowTick(Date.now());
      const t = getMMTTodayISO();
      setMmtDate((prev) => (prev !== t ? t : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!user) return;
    loadData();
    loadHolidayAndLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mmtDate, user]);

  // Fade out check-in / check-out notices after 10 seconds
  useEffect(() => {
    if (!checkInNotice) return;
    const id = setTimeout(() => setCheckInNotice(null), 10_000);
    return () => clearTimeout(id);
  }, [checkInNotice]);
  useEffect(() => {
    if (!checkOutNotice) return;
    const id = setTimeout(() => setCheckOutNotice(null), 10_000);
    return () => clearTimeout(id);
  }, [checkOutNotice]);

  async function loadHolidayAndLeave() {
    if (!user) return;
    try {
      const today = getMMTTodayISO();
      const [evRes, leaveRes, assignRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("id, event_type, assigned_to_all, start_date, end_date")
          .eq("event_type", "holiday")
          .lte("start_date", today)
          .gte("end_date", today),
        supabase
          .from("leave_requests")
          .select("id, type, start_time, end_time, status, half_period")
          .eq("user_id", user.id)
          .eq("date", today)
          .neq("status", "rejected"),
        supabase.from("calendar_event_assignments").select("event_id").eq("user_id", user.id),
      ]);
      const myEventIds = new Set(((assignRes.data as any[]) || []).map((r) => r.event_id));
      const holiday = ((evRes.data as any[]) || []).some((e) => e.assigned_to_all || myEventIds.has(e.id));
      setIsHolidayToday(holiday);
      const leaves = (leaveRes.data as any[]) || [];
      const fullLeave = leaves.some(
        (l) => l.type === "leave" && !l.start_time && !l.end_time,
      );
      setHasFullLeaveToday(fullLeave);
      setHasMorningHalfLeaveToday(
        leaves.some((l) => l.type === "half_leave" && l.half_period === "morning"),
      );
      setHasAfternoonHalfLeaveToday(
        leaves.some((l) => l.type === "half_leave" && l.half_period === "afternoon"),
      );
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (settings.school_latitude !== 0 || settings.school_longitude !== 0) {
      getLocation();
    }
  }, [settings.school_latitude, settings.school_longitude]);

  const getLocation = useCallback(() => {
    try {
      if (!navigator.geolocation) {
        setLocation((prev) => ({
          ...prev,
          status: "error",
          errorMessage: "Geolocation not supported by your browser",
        }));
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
            setLocation({
              status: "error",
              lat: null,
              lng: null,
              distance: null,
              isInside: null,
              errorMessage: "Unable to verify location, please try again",
            });
          }
        },
        (err) => {
          console.warn("Geolocation denied:", err.message);
          const msg =
            err.code === 1
              ? "Location permission is required. Please enable location access in your browser settings."
              : err.code === 3
                ? "Location request timed out"
                : "Unable to get location";
          setLocation({ status: "denied", lat: null, lng: null, distance: null, isInside: null, errorMessage: msg });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    } catch (e) {
      console.error("getLocation unexpected error:", e);
      setLocation({
        status: "error",
        lat: null,
        lng: null,
        distance: null,
        isInside: null,
        errorMessage: "Unable to verify location, please try again",
      });
    }
  }, [settings.school_latitude, settings.school_longitude, settings.allowed_radius_meters]);

  const requestLocationPermission = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setLocation((prev) => ({ ...prev, status: "error", errorMessage: "Geolocation not supported" }));
        resolve(false);
        return;
      }
      setLocation((prev) => ({ ...prev, status: "loading", errorMessage: null }));
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
          const msg =
            err.code === 1
              ? "Location permission is required. Please enable location access in your browser settings."
              : "Unable to get location";
          setLocation({ status: "denied", lat: null, lng: null, distance: null, isInside: null, errorMessage: msg });
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const today = getMMTTodayISO();
      const monthStart = getMonthStart();

      const [attRes, settRes, salRes, profileRes, bonusRes, addRes, profSalRes, smdRes] = await Promise.all([
        supabase.from("attendance").select("*").eq("user_id", user!.id).eq("date", today).maybeSingle(),
        supabase.from("app_settings").select("key,value").in("key", ["start_time","end_time","grace_period_minutes","deduction_rate_per_minute","school_latitude","school_longitude","allowed_radius_meters"]),
        supabase.from("salaries").select("*").eq("user_id", user!.id).eq("month", monthStart).maybeSingle(),
        supabase
          .from("profiles")
          .select("role, full_name, work_day, check_in_time, check_out_time, work_schedule")
          .eq("id", user!.id)
          .maybeSingle(),
        supabase.from("bonus_transactions").select("amount").eq("user_id", user!.id).eq("month", monthStart),
        supabase.from("salary_manual_additions").select("amount").eq("user_id", user!.id).eq("month", monthStart),
        supabase.from("profiles").select("base_salary").eq("id", user!.id).maybeSingle(),
        (supabase as any).from("salary_manual_deductions").select("amount").eq("user_id", user!.id).eq("month", monthStart),
      ]);

      if (attRes.data) {
        const rec = attRes.data as unknown as AttendanceRecord;
        setRecord(rec);
        if (rec.check_in_time && !rec.check_out_time) {
          setCheckInNotice("Checked in successfully");
        }
      }
      {
        // Mirrors SalaryPage's Final Salary formula exactly so the
        // check-in/out remaining amount matches "My Salary & Bonus → Final Salary".
        const earnedBonus = (bonusRes.data as any[] | null)?.reduce((s, b) => s + (Number(b.amount) || 0), 0) ?? 0;
        const additions = (addRes.data as any[] | null)?.reduce((s, a) => s + (Number(a.amount) || 0), 0) ?? 0;
        const sal = salRes.data as any;
        const base = Number(sal?.base_salary ?? (profSalRes.data as any)?.base_salary ?? 0);
        const auto = Number(sal?.total_deductions ?? 0);
        const manual = Number(sal?.manual_deduction ?? 0);
        const extraDed = ((smdRes as any).data as any[] | null)?.reduce((s, d) => s + (Number(d.amount) || 0), 0) ?? 0;
        const current = base + earnedBonus + additions - auto - manual - extraDed;
        setSalary({ base_salary: base, current_salary: current, total_deductions: auto + manual + extraDed });
      }
      if (profileRes.error) {
        console.error("[Attendance] profile fetch error:", profileRes.error);
      }
      if (profileRes.data) {
        const p = profileRes.data as any;
        setUserRole(p.role ?? "staff");
        setFullName(p.full_name ?? "");
        setStaffWorkDay(p.work_day ?? "");
        setStaffCheckInTime(p.check_in_time ?? "");
        setStaffCheckOutTime(p.check_out_time ?? "");
        setWorkSchedule(p.work_schedule ?? null);
        console.log("[Attendance] loaded staff schedule:", {
          user_id: user!.id,
          work_day: p.work_day,
          check_in_time: p.check_in_time,
          work_schedule: p.work_schedule,
        });
      }

      if (settRes.data) {
        const map: Record<string, string> = {};
        (settRes.data as unknown as { key: string; value: string }[]).forEach((r) => (map[r.key] = r.value));
        setSettings({
          start_time: map.start_time ?? DEFAULT_SETTINGS.start_time,
          end_time: map.end_time ?? DEFAULT_SETTINGS.end_time,
          grace_period_minutes: Number(map.grace_period_minutes) || DEFAULT_SETTINGS.grace_period_minutes,
          deduction_rate_per_minute:
            Number(map.deduction_rate_per_minute) || DEFAULT_SETTINGS.deduction_rate_per_minute,
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
        .from("salaries")
        .select("*")
        .eq("user_id", user!.id)
        .eq("month", monthStart)
        .maybeSingle();
      if (existing) return existing as unknown as SalaryRecord;

      const { data: profile } = await supabase.from("profiles").select("base_salary").eq("id", user!.id).single();
      const baseSalary = (profile as any)?.base_salary ?? 300000;
      // Staff cannot insert salary rows directly anymore — server-side
      // edge function (apply-attendance-deduction) creates the row when needed.
      return { base_salary: baseSalary, current_salary: baseSalary, total_deductions: 0 };
    } catch (e) {
      console.error("ensureSalaryRecord error:", e);
      return { base_salary: 300000, current_salary: 300000, total_deductions: 0 };
    }
  };

  const schoolConfigured = settings.school_latitude !== 0 || settings.school_longitude !== 0;
  const isAdmin = userRole === "admin";

  // Today's expected check-in/out time per the staff member's saved schedule.
  // Source of truth priority:
  //   1. profiles.work_schedule[today] when present (per-day schedule set by Admin)
  //   2. legacy profiles.work_day + check_in_time/check_out_time (only if today matches)
  //   3. global app_settings defaults
  const todayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Yangon" }).format(new Date());
  const todaySchedule = workSchedule?.[todayName] ?? null;
  // Only treat as off-day when Admin EXPLICITLY set active=false for today.
  // Missing key or partial entry => assume working day (matches Settings intent).
  const isWorkingDay = todaySchedule ? todaySchedule.active !== false : true;
  const isSpecialDay = !!staffWorkDay && staffWorkDay === todayName;
  const baseExpectedCheckInTime =
    todaySchedule && todaySchedule.active !== false && todaySchedule.check_in
      ? todaySchedule.check_in
      : isSpecialDay && staffCheckInTime
        ? staffCheckInTime
        : settings.start_time;
  // Morning Half-Leave approved → check-in expectation shifts to 12:00 PM (MMT).
  // Check-out expectation stays as Admin/Assistant configured.
  const expectedCheckInTime = hasMorningHalfLeaveToday ? "12:00" : baseExpectedCheckInTime;
  const baseExpectedCheckOutTime =
    todaySchedule && todaySchedule.active !== false && todaySchedule.check_out
      ? todaySchedule.check_out
      : isSpecialDay && staffCheckOutTime
        ? staffCheckOutTime
        : settings.end_time;
  // Afternoon Half-Leave approved → check-out expectation shifts to 12:00 PM (MMT).
  const expectedCheckOutTime = hasAfternoonHalfLeaveToday ? "12:00" : baseExpectedCheckOutTime;
  const geoBlocked = schoolConfigured && location.status === "granted" && location.isInside === false;
  const geoDenied = location.status === "denied";
  const geoError = location.status === "error";
  const geoLoading = location.status === "loading";
  const currentYangonMinutes = yangonNowMinutes();
  const noonMinutes = hhmmToMinutes("12:00");
  const halfOpenMinutes = hhmmToMinutes("11:30");
  // Morning Half-Leave (pending or approved) → afternoon shift check-in window
  // opens at MMT 11:30 AM (staff must check in between 11:30 AM and 12:00 PM).
  // Before 11:30 AM the box stays locked.
  const morningHalfLocked = hasMorningHalfLeaveToday && !record?.check_in_time && currentYangonMinutes < halfOpenMinutes;
  // Afternoon Half-Leave (pending or approved) → after 12:00 PM MMT, BOTH
  // check-in and check-out are locked (the working window has ended).
  const afternoonHalfLocked = hasAfternoonHalfLeaveToday && currentYangonMinutes >= noonMinutes;

  // End-of-day boundary (MMT). After expected check-out + 30 min grace, the
  // workday is considered finished for the day. Until next midnight MMT the
  // page stays in "Day Complete" mode — no morning greeting, no open
  // check-in/out box. State resets automatically at MMT 00:00 next day.
  const endOfWorkDayMinutes = hhmmToMinutes(expectedCheckOutTime) + 30;
  const dayEnded = currentYangonMinutes >= endOfWorkDayMinutes;

  const isOffToday = !isWorkingDay || isHolidayToday || hasFullLeaveToday;
  const canCheckIn = (() => {
    if (isOffToday) return false;
    if (dayEnded) return false;
    if (morningHalfLocked) return false;
    if (afternoonHalfLocked) return false;
    if (record?.check_in_time) return false;
    if (!schoolConfigured) return true;
    if (location.isInside === true) return true;
    if ((geoDenied || geoError) && isAdmin) return true;
    return false;
  })();
  const canCheckOut = !!record?.check_in_time && !record?.check_out_time && !isOffToday && !afternoonHalfLocked;

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
          toast({
            title: "Location permission is required",
            description: "Please enable location access to check in.",
            variant: "destructive",
          });
          setCheckingIn(false);
          return;
        }
      }

      // Re-check after location request
      const currentLocation = location;
      if (schoolConfigured && currentLocation.isInside === false && !isAdmin) {
        toast({
          title: "Outside school area",
          description: `You are ${currentLocation.distance}m away. Move closer to check in.`,
          variant: "destructive",
        });
        setCheckingIn(false);
        return;
      }

      if (schoolConfigured && (currentLocation.status === "denied" || currentLocation.status === "error") && !isAdmin) {
        toast({
          title: "Location permission is required",
          description: "Please enable location access for attendance",
          variant: "destructive",
        });
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

      // Morning Half-Leave shifts the expected check-in to 12:00 PM and the
      // staff is NOT penalised for the morning portion, so the late-minute
      // counter must be suppressed entirely (it would otherwise re-introduce
      // the 200ks/min deduction that the user explicitly does not want).
      const lateMin = (isWorkingDay && !hasMorningHalfLeaveToday)
        ? calcLateMinutes(effectiveStartTime, settings.grace_period_minutes)
        : 0;
      const today = getMMTTodayISO();
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

      const { data, error } = await supabase.from("attendance").insert(insertData).select().single();

      if (error) {
        toast({ title: "Check-in failed", description: error.message, variant: "destructive" });
      } else {
        setRecord(data as unknown as AttendanceRecord);
        setCheckInNotice("Checked in successfully");
        setCheckOutNotice(null);
        const sal = await ensureSalaryRecord();
        setSalary(sal);

        const overrideNote = (geoDenied || geoError) && isAdmin ? " (Admin override)" : "";
        toast({
          title:
            lateMin > 0 ? `Checked in (${lateMin} min late)${overrideNote}` : `Checked in on time ✓${overrideNote}`,
        });

        notifyAdmins(
          "Staff checked in",
          `${fullName || "Staff"} checked in${lateMin > 0 ? ` (${lateMin} min late)` : " on time"}`,
          "/attendance",
        );

        // Show salary notification after check-in
        const estimatedDeduction = lateMin * settings.deduction_rate_per_minute;
        showSalaryNotification(sal.current_salary, estimatedDeduction);
      }
    } catch (e) {
      console.error("handleCheckIn error:", e);
      toast({
        title: "Check-in failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
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
      const earlyMin = isWorkingDay ? calcEarlyMinutes(expectedCheckOutTime) : 0;
      const today = getMMTTodayISO();

      // Only update check_out_time from the client. early_minutes is a
      // protected field and is computed/written server-side by the
      // apply-attendance-deduction edge function.
      void earlyMin;
      const { data, error } = await supabase
        .from("attendance")
        .update({ check_out_time: now.toISOString() } as any)
        .eq("id", record.id)
        .select()
        .single();

      if (error) {
        toast({ title: "Check-out failed", description: error.message, variant: "destructive" });
        return;
      }

      const updatedRecord = data as unknown as AttendanceRecord;
      setRecord(updatedRecord);

      const { data: approvedLeave } = await supabase
        .from("leave_requests")
        .select("type")
        .eq("user_id", user.id)
        .eq("date", today)
        .eq("status", "approved");

      const approvedTypes = (approvedLeave as any[] | null)?.map((r: any) => r.type) ?? [];
      const hasApprovedLeave = approvedTypes.includes("leave");
      const hasApprovedLateExcuse = approvedTypes.includes("late_excuse");

      let finalDeduction = 0;

      if (!updatedRecord.deduction_applied) {
        const { data: result, error: fnErr } = await supabase.functions.invoke("apply-attendance-deduction");
        if (fnErr) {
          console.error("apply-attendance-deduction error:", fnErr);
        } else if (result?.ok) {
          const newCurrent = result.current_salary ?? 0;
          const newDeductions = result.total_deductions ?? 0;
          const baseSalary = result.base_salary ?? 0;
          finalDeduction = result.deduction ?? 0;
          setRecord({ ...updatedRecord, deduction_applied: true });
          setLastDeduction(finalDeduction);
          showSalaryNotification(newCurrent, finalDeduction);
          // Refresh salary using the client-side recompute path (excludes bonus pot)
          loadData();
        }
        setShowSalaryModal(true);
      }

      const excuseNote = hasApprovedLeave ? " (Leave approved)" : hasApprovedLateExcuse ? " (Late excused)" : "";
      const checkoutMsg =
        earlyMin > 0 ? `Checked out (${earlyMin} min early)${excuseNote}` : `Checked out successfully${excuseNote}`;
      toast({ title: checkoutMsg });
      setCheckInNotice(null);
      setCheckOutNotice(checkoutMsg);
      notifyAdmins(
        "Staff checked out",
        `${fullName || "Staff"} checked out${earlyMin > 0 ? ` (${earlyMin} min early)` : ""}${excuseNote}`,
        "/attendance",
      );
    } catch (e) {
      console.error("handleCheckOut error:", e);
      toast({
        title: "Check-out failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
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
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Yangon",
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Attendance</h1>
        </div>
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

      {/* Morning Greeting / Reminder — only shown after 6 AM MMT and
          before end-of-day. After the workday boundary it stays hidden
          until the next MMT midnight (so the page does not flip back to
          a "fresh morning" look during the evening). */}
      {(() => {
        void nowTick;
        const now = new Date();
        const yangonHour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Yangon" }).format(now));
        const after6 = yangonHour >= 6;
        if (!after6) return null;
        if (dayEnded) return null;
        if (checkedIn) return null;
        const displayName = fullName || "မင်္ဂလာပါ";
        const isOffOrLeave = !isWorkingDay || isHolidayToday || hasFullLeaveToday;
        if (isOffOrLeave) {
          return (
            <Card className="border-l-4 border-l-destructive border border-border bg-destructive/5 shadow-none">
              <CardContent className="p-4 text-sm leading-relaxed">
                <p>
                  <span className="font-semibold">{displayName}</span> ပိတ်ရက်လေးရောက်ပြီဆိုတော့ အိပ်ရေးဝအောင် အနားယူပါ
                  🌙 လုပ်စရာရှိတာတွေ စိတ်အေးအေးနဲ့ လုပ်ပါ ✨ သွားစရာရှိရင်လည်း ဘေးကင်းကင်း သွားလာပါ 🚗 ကိုယ့်ကိုယ်ကို
                  ဂရုစိုက်ပြီး ပျော်ရွှင်တဲ့ အနားယူချိန်လေး ဖြစ်ပါစေ 🤍
                </p>
              </CardContent>
            </Card>
          );
        }
        return (
          <Card className="border-l-4 border-l-secondary border border-border bg-secondary/5 shadow-none">
            <CardContent className="p-4 text-sm leading-relaxed">
              <p>
                <span className="font-semibold">{displayName}</span> ယနေ့ မနက် Check in လုပ်ရမည့် အချိန်မှာ{" "}
                <span className="font-semibold text-secondary">{formatTime12h(expectedCheckInTime)}</span> ဖြစ်ပါတယ် အမှီသွားပါနော်
                မင်္ဂလာ မနက်ခင်းပါရှင့်။
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {salaryNotification && (
        <Card className="border-2 border-secondary shadow-md bg-secondary/5 animate-in fade-in slide-in-from-top-2 duration-300">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-secondary" />
              <span className="font-display font-semibold text-sm text-secondary">Salary Notification</span>
            </div>
            <p className="text-sm">
              ယခုလအတွက် သင့်ရဲ့ လစာလက်ကျန်မှာ{" "}
              <span className="font-bold text-secondary">{salaryNotification.remaining.toLocaleString()} MMK</span>{" "}
              ဖြစ်ပါသည်။
            </p>
            <p className="text-sm">
              ယနေ့အတွက် သင့်လစာဖြတ်ခံရသည့် ပမာဏမှာ{" "}
              <span className="font-bold text-destructive">{salaryNotification.deduction.toLocaleString()} MMK</span>{" "}
              ဖြစ်ပါသည်။
            </p>
          </CardContent>
        </Card>
      )}

      {/* Location Status Card */}
      {schoolConfigured && (
        <Card
          className={`border shadow-none ${
            location.isInside === true
              ? "border-accent/30 bg-accent/5"
              : location.isInside === false
                ? "border-destructive/30 bg-destructive/5"
                : geoError
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border"
          }`}
        >
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
                      {isAdmin
                        ? "Admin override available — check-in allowed without location"
                        : "Location permission is required. Please enable it in your browser settings."}
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
                    <p className="text-xs text-muted-foreground">
                      {location.errorMessage || "Unable to verify location, please try again"}
                    </p>
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
                    <p className="text-xs text-muted-foreground">
                      {location.distance}m from school (allowed: {settings.allowed_radius_meters}m)
                    </p>
                  </div>
                  <Badge className="bg-accent/10 text-accent border-accent/30 text-[10px]">Inside</Badge>
                </>
              ) : location.isInside === false ? (
                <>
                  <ShieldX className="h-5 w-5 text-destructive" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold font-display text-destructive">Outside school area</p>
                    <p className="text-xs text-muted-foreground">
                      {location.distance}m away (max: {settings.allowed_radius_meters}m)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-[10px]">
                      Outside
                    </Badge>
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
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-secondary" />
                <span className="font-display font-semibold text-sm">Your Salary This Month</span>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-secondary hover:bg-secondary/10"
                onClick={toggleSalaryVisibility}
                aria-label={salaryHidden ? "Show salary" : "Hide salary"}
                title={salaryHidden ? "Show salary" : "Hide salary"}
              >
                {salaryHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-2xl font-bold font-display text-secondary">
              {salaryHidden ? "•••••• " : `${salary.current_salary.toLocaleString()} `}kyats
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Base: {salaryHidden ? "••••••" : salary.base_salary.toLocaleString()} · Deducted: {salaryHidden ? "••••••" : salary.total_deductions.toLocaleString()}
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
            <p className={`text-lg font-bold font-display mt-1 ${checkedOut || dayEnded ? "text-secondary" : checkedIn ? "text-accent" : "text-muted-foreground"}`}>
              {checkedOut ? "Day Complete ✓" : dayEnded ? "Day Complete ✓" : checkedIn ? "Present ✓" : "Not Checked In"}
            </p>
          </div>
          {/* Today's expected times (above check-in/out buttons) */}
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Check-in time</p>
              <p className="text-lg font-bold font-display text-foreground">{formatTime12h(expectedCheckInTime)}</p>
              {isSpecialDay && <p className="text-[10px] text-secondary mt-0.5">your scheduled day</p>}
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Check-out time</p>
              <p className="text-lg font-bold font-display text-foreground">{formatTime12h(expectedCheckOutTime)}</p>
              {isSpecialDay && <p className="text-[10px] text-secondary mt-0.5">your scheduled day</p>}
            </div>
          </div>

          {checkInNotice && !checkedOut && (
            <div className="rounded-md border border-accent/40 bg-accent/10 p-3 text-left">
              <p className="text-sm font-semibold text-accent">✓ {checkInNotice}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Checked in at {formatTime(record?.check_in_time ?? null)} · stays until you check out
              </p>
            </div>
          )}

          {checkOutNotice && checkedOut && (
            <div className="rounded-md border border-secondary/40 bg-secondary/10 p-3 text-left">
              <p className="text-sm font-semibold text-secondary">✓ {checkOutNotice}</p>
            </div>
          )}

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
              onClick={() => {
                const earlyPreview = isWorkingDay ? calcEarlyMinutes(expectedCheckOutTime) : 0;
                if (earlyPreview > 0) {
                  setConfirmEarlyOpen(true);
                } else {
                  handleCheckOut();
                }
              }}
              disabled={!canCheckOut || checkingOut}
              variant="outline"
              className="active:animate-press"
            >
              {checkingOut ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
              Check Out
            </Button>
          </div>
          {dayEnded && !isOffToday && (
            <p className="text-xs text-muted-foreground">
              ဒီနေ့အတွက် အလုပ်ချိန် ပြီးဆုံးသွားပါပြီ။ နောက်နေ့ Check in / Check out Box သည် မြန်မာစံတော်ချိန် ည ၁၂ နာရီ ကျော်မှ ပြန်ပွင့်ပါမည်။
            </p>
          )}
          {isOffToday && (
            <p className="text-xs text-destructive">
              ဒီနေ့က ပိတ်ရက်ဖြစ်လို့ Check in / Check out ပိတ်ထားပါတယ်
            </p>
          )}
          {morningHalfLocked && (
            <p className="text-xs text-warning">
              Morning Half-Leave ဖြစ်နေပါသည်။ Check in expected time ကို MMT 12:00 PM သို့ ပြောင်းထားပြီး Check in box သည် MMT 11:30 AM မှ စ၍ ပွင့်ပါမည်။ MMT 11:30 AM နှင့် 12:00 PM အတွင်း Check in လုပ်ပါ။
            </p>
          )}
          {hasAfternoonHalfLeaveToday && !hasFullLeaveToday && (
            <p className="text-xs text-warning">
              Afternoon Half-Leave ဖြစ်နေပါသည်။ MMT 12:00 PM မှ စ၍ Check in / Check out ပိတ်ထားပါသည်။
            </p>
          )}
          {!isOffToday && schoolConfigured && !canCheckIn && !checkedIn && !geoLoading && (
            <p className="text-xs text-destructive">
              {geoBlocked
                ? "Move inside school area to check in"
                : (geoDenied || geoError) && !isAdmin
                  ? "Location permission is required to check in"
                  : morningHalfLocked
                    ? "Morning Half-Leave အတွက် MMT 11:30 AM မတိုင်ခင် Check in မလုပ်နိုင်ပါ"
                    : hasAfternoonHalfLeaveToday
                      ? "Afternoon Half-Leave ဖြစ်နေသောကြောင့် Check in ပိတ်ထားပါသည်"
                      : ""}
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
              Expected: {formatTime12h(expectedCheckInTime)}
              {isSpecialDay ? " (your day)" : ""}
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-none">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Check-out</p>
            <p className="text-lg font-bold font-display mt-1">{formatTime(record?.check_out_time ?? null)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Expected: {formatTime12h(expectedCheckOutTime)}
              {isSpecialDay ? " (your day)" : ""}
            </p>
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
                  <span className="text-muted-foreground">
                    Late ({record!.late_minutes} min × {settings.deduction_rate_per_minute} kyats)
                  </span>
                  <span className="font-medium">{lateDeduction.toLocaleString()} kyats</span>
                </div>
              )}
              {earlyDeduction > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Early leave ({record!.early_minutes} min × {settings.deduction_rate_per_minute} kyats)
                  </span>
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

      {userRole === "staff" && <PushNotificationSettings />}

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
              <p>
                ယခုလအတွက် သင့်ရဲ့ လစာလက်ကျန်မှာ{" "}
                <span className="font-semibold">{(salary?.current_salary ?? 0).toLocaleString()} MMK</span> ဖြစ်ပါသည်။
              </p>
              <p>
                ယနေ့အတွက် သင့်လစာဖြတ်ခံရသည့် ပမာဏမှာ{" "}
                <span className="font-semibold">{lastDeduction.toLocaleString()} MMK</span> ဖြစ်ပါသည်။
              </p>
            </div>
            <Button
              onClick={() => setShowSalaryModal(false)}
              className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Early check-out confirmation */}
      <AlertDialog open={confirmEarlyOpen} onOpenChange={setConfirmEarlyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Early Check-out</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-foreground">
              {fullName || "ဆရာ/ဆရာမ"} ရေ ဒီနေ့ အစောကြီး ပြန်တော့မလို့လား? နေရော ကောင်းရဲ့လား? အရေးတကြီး ကိုယ်ရေးကိုယ်တာ
              ရှိလို့လား? ဂရုစိုက်ပြန်ပါရှင်....
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>2. မပြန်သေးပါဘူး မှားနှိပ်လိုက်မိတာပါ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmEarlyOpen(false);
                handleCheckOut();
              }}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              1. ဟုတ်တယ် ပြန်တော့မယ်
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
