import { useEffect, useMemo } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLeaveBalances } from "@/hooks/useLeaveBalances";

type StaffLeaveBalanceMember = {
  id: string;
  full_name: string;
  sequence?: number | null;
};

export function StaffLeaveBalancesCard({ staff }: { staff: StaffLeaveBalanceMember[] }) {
  const orderedStaff = useMemo(
    () => [...staff].sort((a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER)),
    [staff],
  );

  const ids = useMemo(() => orderedStaff.map((m) => m.id), [orderedStaff]);
  const { data, isLoading, refetch } = useLeaveBalances(ids);
  const balances = data ?? {};
  const loading = ids.length > 0 && isLoading;

  // Single tab-return refresh (visibilitychange only — a `focus` listener here
  // would fire the same reload twice for one return to the app).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);


  return (
    <Card className="border border-border shadow-sm bg-gradient-to-b from-card to-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          Staff Leave Balances
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading leave balances…
          </div>
        ) : orderedStaff.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No staff found.</p>
        ) : (
          <div className="grid gap-2 max-h-[24rem] overflow-y-auto pr-1">
            {orderedStaff.map((member) => {
              const balance = balances[member.id] ?? null;

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.full_name}</p>
                      <p className="text-xs text-muted-foreground">Leave balance</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {balance === null ? (
                      <p className="text-xs text-muted-foreground">Unavailable</p>
                    ) : (
                      <>
                        <p className="text-lg font-bold font-display text-primary leading-none">{balance}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">days</p>
                      </>
                    )}
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