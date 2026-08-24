// Guarded service worker registration wrapper.
// Registers only in the published production app. Refuses in dev, iframes,
// Lovable preview hosts, and when ?sw=off is present (kill switch).
//
// Update strategy: MANUAL ONLY. Nothing polls in the background — no interval,
// no visibility/focus/online listeners. The app checks for a new build only
// when the user presses the "Check for update" button in the header.

type UpdateCallback = () => void;

let pendingUpdateSW: ((reload?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
const listeners = new Set<UpdateCallback>();
let updateAvailable = false;
let applying = false;

export function onUpdateAvailable(cb: UpdateCallback): () => void {
  listeners.add(cb);
  if (updateAvailable) cb();
  return () => listeners.delete(cb);
}

export function isUpdateAvailable() {
  return updateAvailable;
}


export async function applyUpdate() {
  if (applying) return;
  applying = true;
  try {
    if (pendingUpdateSW) {
      // Safety net: if the new SW claims clients but does not reload the page
      // (some browsers), force a clean reload ourselves.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => window.location.reload(),
          { once: true }
        );
      }
      window.setTimeout(() => window.location.reload(), 3000);
      await pendingUpdateSW(true);
      return;
    }
  } catch {
    // fall through to hard reload
  }
  window.location.reload();
}

/**
 * Manually ask the browser for a newer build.
 * Returns true when a new version was found (the page then reloads itself).
 */
export async function checkForUpdate(): Promise<boolean> {
  if (updateAvailable) {
    void applyUpdate();
    return true;
  }
  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return false;
  }
  try {
    const reg =
      swRegistration ?? (await navigator.serviceWorker.getRegistration("/"));
    if (!reg) {
      window.location.reload();
      return false;
    }
    await reg.update();
    // Give the browser a moment to surface a waiting worker.
    await new Promise((r) => window.setTimeout(r, 1200));
    if (updateAvailable || reg.waiting) {
      void applyUpdate();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isRefusedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("sw") === "off") return true;
  return false;
}

async function unregisterAppSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url =
            r.active?.scriptURL ||
            r.installing?.scriptURL ||
            r.waiting?.scriptURL ||
            "";
          return url.endsWith("/sw.js");
        })
        .map((r) => r.unregister().catch(() => false))
    );
  } catch {
    // ignore
  }
}

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}

export async function registerPwa() {
  if (typeof window === "undefined") return;

  if (isRefusedContext()) {
    await unregisterAppSW();
    return;
  }

  try {
    const { registerSW } = await import("virtual:pwa-register");
    pendingUpdateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Only reachable from a user-triggered checkForUpdate(); never applied
        // automatically in the background.
        updateAvailable = true;
        notifyListeners();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        swRegistration = registration;
        // No update() call here, no interval, no visibility/focus/online
        // listeners — checking happens only on the manual button press.
      },
    });
  } catch {
    // virtual module unavailable — silently skip
  }

}
