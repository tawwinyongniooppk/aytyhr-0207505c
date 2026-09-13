import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server-verified role check for privileged routes.
 *
 * Unlike the cached profile state, this calls the current_user_role() RPC,
 * which reads the caller's role from the profiles table server-side keyed by
 * auth.uid(). Client-side state tampering (e.g. React DevTools) cannot
 * influence the result, so privileged pages only render after the server
 * confirms the caller's role. Data access itself remains enforced by RLS/RPCs.
 */
export function useServerRole(enabled: boolean) {
  return useQuery({
    queryKey: ["server-role"],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("current_user_role");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}
