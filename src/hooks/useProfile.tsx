import { useState, useEffect } from "react";
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

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setError(null);
        const { data, error: fetchError } = await withNetworkRetry(() =>
          supabase.rpc("get_profile_full", { p_id: user!.id })
        );

        if (cancelled) return;

        const row = Array.isArray(data) ? data[0] : data;
        if (fetchError) {
          setError(isNetworkError(fetchError) ? NETWORK_ERROR_MESSAGE : "Failed to load profile. Please try again.");
          setProfile(null);
        } else if (!row) {
          setError("No profile found for this account. Contact an administrator.");
          setProfile(null);
        } else {
          setProfile(row as Profile);
        }
      } catch (err) {
        if (!cancelled) setError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : "Unexpected error loading profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }


    load();
    return () => { cancelled = true; };
  }, [user]);

  const role = profile?.role;
  const isAdmin = role === "admin" || role === "assistant";
  const isAssistant = role === "assistant";
  const isStaff = role === "staff" || !role;
  const isItManager = role === "it_manager";
  const canViewSalary = role === "admin" || role === "staff";
  const isNeutralClass = (profile?.class ?? "Neutral") === "Neutral";

  return { profile, loading, error, isAdmin, isAssistant, isStaff, isItManager, canViewSalary, isNeutralClass };
}
