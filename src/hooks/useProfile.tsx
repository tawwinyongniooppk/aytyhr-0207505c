import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  base_salary: number;
  phone: string | null;
  join_date: string | null;
  check_in_time: string;
  check_out_time: string;
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
        const { data, error: fetchError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user!.id)
          .maybeSingle();

        if (cancelled) return;

        if (fetchError) {
          setError("Failed to load profile. Please try again.");
          setProfile(null);
        } else if (!data) {
          setError("No profile found for this account. Contact an administrator.");
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch {
        if (!cancelled) setError("Unexpected error loading profile.");
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

  return { profile, loading, error, isAdmin, isAssistant, isStaff, isItManager, canViewSalary };
}
