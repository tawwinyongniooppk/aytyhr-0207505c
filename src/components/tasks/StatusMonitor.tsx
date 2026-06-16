import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getMMTMonthStartISO } from "@/lib/mmt";
import { STATUS_COLUMNS, emptyMemberStats, type MemberStats } from "@/lib/taskStatusStats";

interface StaffLite {
  id: string;
  full_name: string;
  sequence?: number | null;
}

interface MonitorRow extends StaffLite, MemberStats {}

const MONTHLY_WEIGHT_CAP = 4;

export function StatusMonitor({ staffList }: { staffList: StaffLite[] }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MonitorRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const monthStart = getMMTMonthStartISO();
        const { data, error } = await (supabase as any).rpc("get_task_status_monitor", {
          p_month_start: monthStart,
        });
        if (error) throw error;

        if (!cancelled) {
          setRows(((data as any[]) || []).map((r) => ({
            id: r.user_id,
            full_name: r.full_name || "Unnamed",
            sequence: r.sequence,
            newTask: Number(r.new_task || 0),
            inProgress: Number(r.in_progress || 0),
            submitted: Number(r.submitted || 0),
            approved: Number(r.approved || 0),
            overdue: Number(r.overdue || 0),
            reject: Number(r.reject || 0),
            allDone: Number(r.all_done || 0),
          })));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const displayRows = rows.length > 0 ? rows : staffList.map((s) => ({ ...s, ...emptyMemberStats() }));

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
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3">No staff found.</p>
        ) : (
          <div className="space-y-2">
            {[...displayRows].sort((a, b) => {
              if (user && a.id === user.id) return -1;
              if (user && b.id === user.id) return 1;
              return (a.sequence ?? 999) - (b.sequence ?? 999);
            }).map((s) => {
              const st = s || emptyMemberStats();
              const totalDone = Math.min(st.allDone, MONTHLY_WEIGHT_CAP);
              return (
                <div key={s.id} className={`rounded-md border px-3 py-2 ${user && s.id === user.id ? "border-primary/50 bg-primary/5" : "border-border bg-background"}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-2 min-w-0">
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
