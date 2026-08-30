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
export function useVisibleRefresh(refresh: () => void | Promise<void>, debounceMs = 400) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const pendingRef = useRef(false);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const run = useCallback(async () => {
    if (!mountedRef.current) return;
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
      if (mountedRef.current && pendingRef.current && typeof document !== "undefined" && !document.hidden) {
        pendingRef.current = false;
        void run();
      }
    }
  }, []);

  // Call this from an existing Realtime handler instead of the loader directly.
  // Phase 2B-2: when visible, rapid event bursts are coalesced into ONE refresh
  // after `debounceMs` of quiet. Hidden events keep Phase 2B-1 behaviour.
  const trigger = useCallback(() => {
    if (typeof document !== "undefined" && document.hidden) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      pendingRef.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!mountedRef.current) return;
      if (typeof document !== "undefined" && document.hidden) {
        pendingRef.current = true;
        return;
      }
      void run();
    }, debounceMs);
  }, [run, debounceMs]);

  useEffect(() => {
    mountedRef.current = true;
    const onVisible = () => {
      if (document.hidden) return;
      if (!pendingRef.current) return;
      pendingRef.current = false;
      // A debounce timer may also be scheduled — cancel it so the
      // visibility refresh and the burst refresh never both run.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [run]);

  return trigger;
}

