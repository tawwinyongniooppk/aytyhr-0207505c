import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { withNetworkRetry, isNetworkError, NETWORK_ERROR_MESSAGE } from "@/lib/netRetry";


interface Profile {
  id: string;
  full_name: string;
  role: string;
  base_salary: number;
  phone: string | null;
  join_date: string | null;
  check_in_time: string;
  check_out_time: string;
  work_day: string;
  avatar_url?: string | null;
  sequence?: number;
  class?: string;
}

// Shared cache for the current user's profile. Multiple mounted components
// (AppLayout, AppHeader, DesktopSidebar, BottomNav, active pages) all request
// the same user's profile; React Query deduplicates them into a single
// `get_profile_full` RPC call and reuses the cached result for 60 seconds.
export const PROFILE_STALE_TIME = 60_000; // 60 seconds

export function profileKey(userId: string) {
  return ["profile", userId] as const;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error: fetchError } = await withNetworkRetry(
    async () => await supabase.rpc("get_profile_full", { p_id: userId })
  );
  if (fetchError) throw fetchError;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Profile) ?? null;
}

export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();

  // On logout (no user), purge any cached profile so a subsequent login can
  // never read the previous user's data. The query key is per-user anyway, so
  // a different user could not access it, but this keeps the cache tidy and
  // guarantees the safety requirement explicitly.
  useEffect(() => {
    if (!userId) {
      qc.removeQueries({ queryKey: ["profile"] });
    }
  }, [userId, qc]);

  const query = useQuery({
    queryKey: profileKey(userId ?? "none"),
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
    staleTime: PROFILE_STALE_TIME,
    // withNetworkRetry already retries transient network errors; do not let
    // React Query re-run the whole fetch (and its retries) again on failure.
    retry: false,
  });

  const profile = query.data ?? null;

  // Match the previous loading semantics: loading only while a fetch for the
  // current user is in progress with no cached data yet.
  const loading = !!userId && query.isPending;

  let error: string | null = null;
  if (query.error) {
    error = isNetworkError(query.error)
      ? NETWORK_ERROR_MESSAGE
      : "Failed to load profile. Please try again.";
  } else if (userId && !loading && !profile) {
    error = "No profile found for this account. Contact an administrator.";
  }

  const role = profile?.role;
  const isAdmin = role === "admin" || role === "assistant";
  const isAssistant = role === "assistant";
  const isStaff = role === "staff" || !role;
  const isItManager = role === "it_manager";
  const canViewSalary = role === "admin" || role === "staff";
  const isNeutralClass = (profile?.class ?? "Neutral") === "Neutral";

  return { profile, loading, error, isAdmin, isAssistant, isStaff, isItManager, canViewSalary, isNeutralClass };
}
