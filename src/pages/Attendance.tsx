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
  school_latitude