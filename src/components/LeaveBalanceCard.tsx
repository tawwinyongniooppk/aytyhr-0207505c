import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLeaveBalance } from "@/hooks/useLeaveBalances";

export function LeaveBalanceCard({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const targetId = userId ?? user?.id;
  const { data, isLoading, refetch } = useLeaveBalance(targetId);
  const balance = data ?? null;
  const loading = !!targetId && isLoading;

  useEffect(() => {
    if (!targetId) return;
    // Refresh when the tab becomes visible again (avoids a realtime channel).
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [targetId, refetch]);



  return (
    <Card className="border border-border shadow-none bg-primary/5">
      <CardContent className="flex items-center gap-3 py-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <CalendarDays className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {loading || balance === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading balance…
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium leading-snug">
                သင်၏ ခွင့်လက်ကျန်ရက်မှာ{" "}
                <span className="text-primary font-bold text-base">{balance}</span> ရက် ဖြစ်ပါသည်။
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                သင့်ကို System မှ (၁)လကို အများဆုံး (၂)ရက်နှင့် စာသင်နှစ် (၁)နှစ်လုံးစာအတွက် အများဆုံး (၁၀)ရက်သာ ခွင့်ပြုထားပါသည်။
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
