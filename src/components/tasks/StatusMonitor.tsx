// Status Monitor — shown at the bottom of the Staff "My Tasks" page so each
// staff can see their own + everyone else's progress across the current month.
// Status counts only; NO bonus/financial figures are surfaced here.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getMMTMonthStartISO, getMMTTodayISO } from "@/lib/mmt";
import {
  STATUS_COLUMNS,
  computeMemberStats,
  emptyMemberStats,
  type MemberStats,
} from "@/lib/taskStatusStats";

interface StaffLite {
  id: string;
  full_name: string;
  sequence?: number | null;
}

const MONTHLY_WEIGHT_CAP = 4;

export function StatusMonitor({ staffList }: { staffList: StaffLite[] }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, MemberStats>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const monthStart = getMMTMonthStartISO();
        const [y, m] = monthStart.split("-").map(Number);
        const ny = m === 12 ? y + 1 : y;
        const nm = m === 12 ? 1 : m + 1;
        const nextMonthStart = `${ny}-${String(nm).padStart(2, "0")}-01`;
        const today = getMMTTodayISO();

        const { data: evs } = await supabase
          .from("calendar_events")
          .select("id, start_date, end_date")
          .eq("event_type", "task")
          .gte("start_date", monthStart)
          .lt("start_date", nextMonthStart);
        const events = (evs as { id: string; start_date: string; end_date: string }[]) || [];

        let assignments: any[] = [];
        if (events.length > 0) {
          const { data: ass } = await supabase
            .from("calendar_event_assignments")
            .select("user_id, event_id, submission_status, approved_at")
            .in("event_id", events.map((e) => e.id));
          assignments = (ass as any[]) || [];
        }

        if (!cancelled) setStats(computeMemberStats(events, assignments, today));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Status Monitor
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Team task status for this month (status only — no bonus/financial figures).
        </p>
      </CardHeader>
      <CardContent className="p-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : staffList.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">No staff found.</p>
        ) : (
          <div className="space-y-2">
            {[...staffList].sort((a, b) => {
              if (user && a.id === user.id) return -1;
              if (user && b.id === user.id) return 1;
              return (a.sequence ?? 999) - (b.sequence ?? 999);
            }).map((s) => {
              const st = stats[s.id] || emptyMemberStats();
              const totalDone = Math.min(st.allDone, MONTHLY_WEIGHT_CAP);
              return (
                <div key={s.id} className="rounded-md border border-border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground w-5 shrink-0">
                        #{s.sequence ?? "—"}
                      </span>
                      <span className="font-medium text-sm truncate">{s.full_name || "Unnamed"}</span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                        totalDone >= MONTHLY_WEIGHT_CAP
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {totalDone}/{MONTHLY_WEIGHT_CAP} Units
                    </span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                    {STATUS_COLUMNS.map((c) => (
                      <div
                        key={c.key}
                        className={`flex flex-col items-center justify-center rounded px-1 py-1 ${c.cls}`}
                      >
                        <span className="text-[9px] uppercase tracking-wider opacity-80 leading-tight text-center break-words">
                          {c.label}
                        </span>
                        <span className="text-sm font-bold leading-tight mt-0.5">{st[c.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
