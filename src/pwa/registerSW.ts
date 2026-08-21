// Guarded service worker registration wrapper.
// Registers only in the published production app. Refuses in dev, iframes,
// Lovable preview hosts, and when ?sw=off is present (kill switch).

type UpdateCallback = () => void;

let pendingUpdateSW: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<UpdateCallback>();
let updateAvailable = false;

export function onUpdateAvailable(cb: UpdateCallback): () => void {
  listeners.add(cb);
  if (updateAvailable) cb();
  return () => listeners.delete(cb);
}

export function isUpdateAvailable() {
  return updateAvailable;
}

export async function applyUpdate() {
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
  // Hard refresh fallback — bypass HTTP cache where supported.
  // @ts-ignore - legacy non-standard arg still respected by some engines
  window.location.reload();
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
        updateAvailable = true;
        // Login is a critical entry point. Do not leave signed-out users on an
        // old auth bundle with no update control available to them.
        if (window.location.pathname === "/login") {
          window.setTimeout(() => {
            void applyUpdate();
          }, 0);
          return;
        }
        listeners.forEach((cb) => {
          try {
            cb();
          } catch {
            // ignore
          }
        });
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        registration.update().catch(() => {});
        // Poll for updates every 30 minutes while the tab is alive.
        setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);
        // Also check when the tab regains focus.
        window.addEventListener("focus", () => {
          registration.update().catch(() => {});
        });
      },
    });
  } catch {
    // virtual module unavailable — silently skip
  }
}
