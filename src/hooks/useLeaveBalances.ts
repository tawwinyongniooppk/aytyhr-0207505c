import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Leave balance readers backed by React Query so repeated mounts of the same
 * card (and the admin dashboard rendering both cards) share one request.
 * The underlying calculation still comes from the existing database
 * functions — nothing about the balance rules or authorization changes.
 */

const STALE_TIME = 60_000;

export function leaveBalanceKey(userId: string) {
  return ["leave-balance", userId] as const;
}

export function useLeaveBalance(userId?: string) {
  return useQuery({
    queryKey: leaveBalanceKey(userId ?? "none"),
    enabled: !!userId,
    staleTime: STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_leave_balance", { p_user_id: userId! });
      if (error) throw error;
      return typeof data === "number" ? data : null;
    },
  });
}

/** One batched RPC call for many users instead of one call per user. */
export function useLeaveBalances(userIds: string[]) {
  const qc = useQueryClient();
  const key = [...userIds].sort().join(",");
  return useQuery({
    queryKey: ["leave-balances", key],
    enabled: userIds.length > 0,
    staleTime: STALE_TIME,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_leave_balances_all", {
        p_user_ids: userIds,
      });
      if (error) throw error;
      const map: Record<string, number | null> = {};
      for (const row of ((data as any[]) || [])) {
        const value = typeof row.balance === "number" ? row.balance : Number(row.balance);
        map[row.user_id] = value;
        // Share the batch result so a single-user card does not refetch it.
        qc.setQueryData(leaveBalanceKey(row.user_id), value);
      }
      return map;
    },
  });
}
