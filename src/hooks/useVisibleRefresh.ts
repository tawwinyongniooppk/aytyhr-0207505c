import { useCallback, useEffect, useRef } from "react";

/**
 * Phase 2B-1 helper.
 *
 * Wraps an existing data-loading function so Realtime-triggered reloads do NOT
 * run while the tab is hidden. Hidden events only set a "pending" flag; when the
 * tab becomes visible again exactly ONE refresh runs, regardless of how many
 * events arrived while hidden. Also prevents overlapping refreshes.
 *
 * It does not change subscriptions, filters, tables or any business logic.
 */
export function useVisibleRefresh(refresh: () => void | Promise<void>) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const pendingRef = useRef(false);
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    if (runningRef.current) {
      // A refresh is already in flight — remember that newer data exists.
      pendingRef.current = true;
      return;
    }
    runningRef.current = true;
    try {
      await refreshRef.current();
    } finally {
      runningRef.current = false;
      if (pendingRef.current && typeof document !== "undefined" && !document.hidden) {
        pendingRef.current = false;
        void run();
      }
    }
  }, []);

  // Call this from an existing Realtime handler instead of the loader directly.
  const trigger = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) {
      pendingRef.current = true;
      return;
    }
    void run();
  }, [run]);

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) return;
      if (!pendingRef.current) return;
      pendingRef.current = false;
      void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run]);

  return trigger;
}
