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
  work_day: string;
  avatar_url?: string | null;
  sequence?: number;
}

// Global module-level store to deduplicate concurrent requests and cache session data
interface GlobalState {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  uid: string | null;
}

let globalState: GlobalState = {
  profile: null,
  loading: false,
  error: null,
  uid: null,
};

let activePromise: Promise<any> | null = null;
const listeners = new Set<() => void>();

function updateGlobalState(next: Partial<GlobalState>) {
  globalState = { ...globalState, ...next };
  listeners.forEach((listener) => listener());
}

export function useProfile() {
  const { user } = useAuth();

  // Initialize local state safely from the shared global store, ensuring it never returns null
  const [state, setState] = useState<GlobalState>(() => {
    if (user && globalState.uid === user.id) {
      return globalState;
    }
    return {
      profile: null,
      loading: !!user,
      error: null,
      uid: user?.id || null,
    };
  });

  useEffect(() => {
    if (!user) {
      updateGlobalState({ profile: null, loading: false, error: null, uid: null });
      return;
    }

    // If the user session changed, reset the global cache store
    if (globalState.uid !== user.id) {
      activePromise = null;
      globalState = {
        profile: null,
        loading: true,
        error: null,
        uid: user.id,
      };
    }

    // Subscribe local state updates to global state changes safely
    const handleChange = () => {
      if (globalState) {
        setState(globalState);
      }
    };
    listeners.add(handleChange);
    handleChange(); // Sync immediately

    // Deduplicate: If there is no active request and data isn't loaded yet, fetch it once
    if (!globalState.profile && !activePromise && !globalState.error) {
      updateGlobalState({ loading: true, error: null });

      activePromise = supabase
        .rpc("get_profile_full", { p_id: user.id })
        .then(({ data, error: fetchError }) => {
          if (fetchError) {
            updateGlobalState({
              error: "Failed to load profile. Please try again.",
              profile: null,
              loading: false,
            });
            return;
          }

          const row = Array.isArray(data) ? data[0] : data;
          if (!row) {
            updateGlobalState({
              error: "No profile found for this account. Contact an administrator.",
              profile: null,
              loading: false,
            });
            return;
          }

          updateGlobalState({
            profile: row as Profile,
            error: null,
            loading: false,
          });
        })
        .catch(() => {
          updateGlobalState({
            error: "Unexpected error loading profile.",
            loading: false,
          });
        });
    }

    return () => {
      listeners.delete(handleChange);
    };
  }, [user]);

  // Fallback to globalState or default object to strictly prevent destructuring errors
  const currentState = state || globalState || { profile: null, loading: false, error: null };
  const { profile, loading, error } = currentState;
  const role = profile?.role;

  // Core System Permissions Check
  const isAdmin = role === "admin";
  const isAssistant = role === "assistant";
  const isStaff = role === "staff" || !role;
  const isItManager = role === "it_manager";

  // STRICT PERMISSION: Only full Admins can view/manage the overall company financial details & list of all salaries.
  const canViewSalary = role === "admin";

  return { profile, loading, error, isAdmin, isAssistant, isStaff, isItManager, canViewSalary };
}
