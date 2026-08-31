import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Shared cache for the `list_staff_directory` RPC result.
// Used by Tasks.tsx and CalendarPage.tsx so both screens reuse one fetch
// instead of each issuing their own request.
export const STAFF_DIRECTORY_KEY = ["staff-directory"] as const;
export const STAFF_DIRECTORY_STALE_TIME = 10 * 60 * 1000; // 10 minutes

async function fetchDirectory(): Promise<any[]> {
  const { data, error } = await (supabase.rpc("list_staff_directory") as any);
  if (error) throw error;
  return (data as any[]) ?? [];
}

// Imperative cached fetch — drops into existing async loaders without
// changing their structure, error handling, or loading states.
export function fetchStaffDirectory(queryClient: QueryClient): Promise<any[]> {
  return queryClient.fetchQuery({
    queryKey: STAFF_DIRECTORY_KEY,
    queryFn: fetchDirectory,
    staleTime: STAFF_DIRECTORY_STALE_TIME,
  });
}

// Hook form for components that want reactive cached directory data.
export function useStaffDirectory() {
  return useQuery({
    queryKey: STAFF_DIRECTORY_KEY,
    queryFn: fetchDirectory,
    staleTime: STAFF_DIRECTORY_STALE_TIME,
  });
}
