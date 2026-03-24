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
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user!.id)
          .single();
        if (!cancelled) setProfile(data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user]);

  const isAdmin = profile?.role === "admin" || profile?.role === "assistant";
  const isAssistant = profile?.role === "assistant";
  const isStaff = profile?.role === "staff";
  const canViewSalary = profile?.role === "admin" || profile?.role === "staff";

  return { profile, loading, isAdmin, isAssistant, isStaff, canViewSalary };
}
