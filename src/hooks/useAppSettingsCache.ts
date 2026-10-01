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
    /** Optimistically write the value after an admin toggle. */
    setSlipSetting: (next: SlipSetting) =>
      qc.setQueryData(["app_settings", "slip_signing"], next),
    /** Force a refresh (used by the existing realtime app_settings listener). */
    refreshSlipSetting: () => qc.invalidateQueries({ queryKey: ["app_settings", "slip_signing"] }),
  };
}

const LOGO_CACHE_KEY = "ayty:company_logo_url";
export const SCHOOL_PHONE_CACHE_KEY = "ayty:school_phone";
export const SCHOOL_ADDRESS_CACHE_KEY = "ayty:school_address";

function cacheLocal(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}

// Same single request as before; it now also returns the two school-wide
// contact values so My ID can read them from local cache with zero requests.
async function fetchCompanyLogo(): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["company_logo_url", "school_phone", "school_address"]);
  const rows = ((data as any[]) || []) as { key: string; value: string }[];
  const get = (k: string) => rows.find((r) => r.key === k)?.value || null;
  if (data) {
    cacheLocal(SCHOOL_PHONE_CACHE_KEY, get("school_phone"));
    cacheLocal(SCHOOL_ADDRESS_CACHE_KEY, get("school_address"));
  }
  const url = get("company_logo_url");
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

/** IT Manager save for school phone/address; updates local cache, no refetch. */
export async function saveSchoolContact(phone: string, address: string) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("app_settings").upsert(
    [
      { key: "school_phone", value: phone, updated_at: now },
      { key: "school_address", value: address, updated_at: now },
    ],
    { onConflict: "key" },
  );
  if (error) throw error;
  cacheLocal(SCHOOL_PHONE_CACHE_KEY, phone || null);
  cacheLocal(SCHOOL_ADDRESS_CACHE_KEY, address || null);
}

export function readCachedSchoolContact() {
  try {
    return {
      phone: localStorage.getItem(SCHOOL_PHONE_CACHE_KEY),
      address: localStorage.getItem(SCHOOL_ADDRESS_CACHE_KEY),
    };
  } catch {
    return { phone: null, address: null };
  }
}
