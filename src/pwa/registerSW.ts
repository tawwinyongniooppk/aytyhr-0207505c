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

let reloading = false;
function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

/** Resolve when `sw` reaches installed/activated (or fails). Single bounded wait, no polling. */
function waitForInstalled(sw: ServiceWorker, timeoutMs = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    if (sw.state === "installed" || sw.state === "activated") return resolve(true);
    if (sw.state === "redundant") return resolve(false);
    const timer = window.setTimeout(() => {
      sw.removeEventListener("statechange", onChange);
      resolve(false);
    }, timeoutMs);
    function onChange() {
      if (sw.state === "installed" || sw.state === "activating" || sw.state === "activated") {
        window.clearTimeout(timer);
        sw.removeEventListener("statechange", onChange);
        resolve(true);
      } else if (sw.state === "redundant") {
        window.clearTimeout(timer);
        sw.removeEventListener("statechange", onChange);
        resolve(false);
      }
    }
    sw.addEventListener("statechange", onChange);
  });
}

/**
 * Manually ask the browser for a newer build (user-initiated only).
 * Returns true when a new version was found (the page then reloads once).
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg =
      swRegistration ?? (await navigator.serviceWorker.getRegistration("/"));
    if (!reg) return false;

    const hadController = !!navigator.serviceWorker.controller;
    // Arm a one-time reload when the new worker takes control.
    const onControllerChange = () => {
      if (hadController) reloadOnce();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });

    // Already-waiting worker from an earlier download.
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(reloadOnce, 4000); // safety net, one-shot
      return true;
    }

    await reg.update();

    const incoming = reg.installing || reg.waiting;
    if (!incoming) {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      return false;
    }

    const ok = await waitForInstalled(incoming);
    if (!ok) {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      return false;
    }
    // skipWaiting is configured, but nudge a waiting worker just in case.
    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    window.setTimeout(reloadOnce, 4000); // safety net if controllerchange is missed
    return true;
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
