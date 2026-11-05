import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationProvider, useNotifications } from "@/hooks/useNotifications";

const mocks = vi.hoisted(() => ({ register: vi.fn(), enabled: true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "current-staff" } }) }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ loading: false }) }));
vi.mock("@/lib/firebase", () => ({ FCM_SW_SCOPE: "/fcm/", getPushAvailability: async () => ({ supported: true }), getMessagingSafe: async () => null, onMessage: vi.fn() }));
vi.mock("@/lib/push", () => ({ isPushEnabled: () => mocks.enabled, registerCurrentDevicePushToken: mocks.register, setPushEnabled: (value: boolean) => { mocks.enabled = value; }, unregisterCurrentDevicePushToken: async () => ({ ok: true }) }));

function Probe() {
  const n = useNotifications();
  return <><output aria-label="access">{n.attendanceReady() ? "allowed" : "blocked"}</output><output aria-label="status">{n.setupStatus}</output><button onClick={() => { void n.enableNotifications(true); void n.enableNotifications(true); }}>Enable</button><button onClick={() => { void n.disableNotifications(); }}>Disable</button></>;
}
let permission: NotificationPermission;
let root: Root | undefined;
let container: HTMLDivElement;
async function renderProbe() {
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root?.render(<NotificationProvider><Probe /></NotificationProvider>); });
}
function text(label: string) { return container.querySelector(`[aria-label="${label}"]`)?.textContent; }
async function click(label: string) {
  await act(async () => {
    const button = Array.from(container.querySelectorAll("button")).find(b => b.textContent === label);
    button?.click();
  });
}
beforeEach(() => {
  mocks.register.mockReset(); mocks.enabled = true; permission = "default";
  Object.defineProperty(globalThis, "Notification", { configurable: true, value: { get permission() { return permission; } } });
});
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); });
describe("shared device registration flow", () => {
  it("blocks default permission until an explicit enable registers successfully, coalescing clicks", async () => {
    mocks.register.mockResolvedValue({ ok: false, reason: "Permission required" });
    await renderProbe();
    expect(text("status")).toBe("incomplete");
    expect(mocks.register).toHaveBeenCalledWith({ prompt: false });
    expect(text("access")).toBe("blocked");
    mocks.register.mockImplementation(async () => { permission = "granted"; return { ok: true }; });
    await click("Enable");
    expect(text("access")).toBe("allowed");
    expect(mocks.register).toHaveBeenCalledTimes(2);
  });
  it("blocks granted permission if token registration fails and allows retry", async () => {
    permission = "granted"; mocks.register.mockRejectedValue(new Error("Registration failed"));
    await renderProbe();
    expect(text("status")).toBe("failed");
    expect(text("access")).toBe("blocked");
    mocks.register.mockResolvedValue({ ok: true }); await click("Enable");
    expect(text("access")).toBe("allowed");
  });
  it("revocation blocks access on returning to the app without polling or registration", async () => {
    permission = "granted"; mocks.register.mockResolvedValue({ ok: true });
    await renderProbe();
    expect(text("access")).toBe("allowed");
    permission = "denied"; await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(text("access")).toBe("blocked");
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });
  it("existing off control blocks Attendance", async () => {
    permission = "granted"; mocks.register.mockResolvedValue({ ok: true });
    await renderProbe();
    expect(text("access")).toBe("allowed");
    await click("Disable");
    expect(text("access")).toBe("blocked");
  });
});