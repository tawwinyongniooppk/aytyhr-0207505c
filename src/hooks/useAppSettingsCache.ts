import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared, cached readers for small `app_settings` values.
 * Multiple components/pages that need the same setting share one request
 * instead of each issuing its own identical query on every mount.
 */

const SLIP_KEYS = ["slip_signing_enabled", "slip_signing_enabled_until"] as const;

export type SlipSetting = { enabled: boolean; until: string | null };

async function fetchSlipSetting(): Promise<SlipSetting> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", SLIP_KEYS as unknown as string[]);

  let enabled = false;
  let until: string | null = null;
  for (const r of ((data as any[]) || [])) {
    if (r.key === "slip_signing_enabled") enabled = r.value === "true";
    if (r.key === "slip_signing_enabled_until") until = r.value;
  }
  return { enabled, until };
}

export function useSlipSetting() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["app_settings", "slip_signing"],
    queryFn: fetchSlipSetting,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  return {
    slipEnabled: query.data?.enabled ?? false,
    slipUntil: query.data?.until ?? null,
    /** Force a refresh (used by the existing realtime app_settings listener). */
    refreshSlipSetting: () => qc.invalidateQueries({ queryKey: ["app_settings", "slip_signing"] }),
  };
}

const LOGO_CACHE_KEY = "ayty:company_logo_url";

async function fetchCompanyLogo(): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "company_logo_url")
    .maybeSingle();
  const url = (data as any)?.value ?? null;
  try {
    if (url) localStorage.setItem(LOGO_CACHE_KEY, url);
    else localStorage.removeItem(LOGO_CACHE_KEY);
  } catch {
    /* storage unavailable — cache is best-effort */
  }
  return url;
}

export function useCompanyLogo() {
  const qc = useQueryClient();
  let initial: string | null = null;
  try {
    initial = localStorage.getItem(LOGO_CACHE_KEY);
  } catch {
    initial = null;
  }

  const query = useQuery({
    queryKey: ["app_settings", "company_logo_url"],
    queryFn: fetchCompanyLogo,
    // Show the last known logo instantly, still revalidate in the background.
    placeholderData: initial ?? undefined,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const setLogoUrl = (url: string | null) => {
    try {
      if (url) localStorage.setItem(LOGO_CACHE_KEY, url);
      else localStorage.removeItem(LOGO_CACHE_KEY);
    } catch {
      /* ignore */
    }
    qc.setQueryData(["app_settings", "company_logo_url"], url);
  };

  return { logoUrl: query.data ?? initial ?? null, setLogoUrl };
}
