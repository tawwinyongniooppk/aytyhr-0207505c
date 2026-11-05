import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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
beforeEach(() => {
  mocks.register.mockReset(); mocks.enabled = true; permission = "default";
  Object.defineProperty(globalThis, "Notification", { configurable: true, value: { get permission() { return permission; } } });
});
afterEach(cleanup);
describe("shared device registration flow", () => {
  it("blocks default permission until an explicit enable registers successfully, coalescing clicks", async () => {
    mocks.register.mockResolvedValue({ ok: false, reason: "Permission required" });
    render(<NotificationProvider><Probe /></NotificationProvider>);
    await waitFor(() => expect(screen.getByLabelText("status")).toHaveTextContent("incomplete"));
    expect(mocks.register).toHaveBeenCalledWith({ prompt: false });
    expect(screen.getByLabelText("access")).toHaveTextContent("blocked");
    mocks.register.mockImplementation(async () => { permission = "granted"; return { ok: true }; });
    fireEvent.click(screen.getByText("Enable"));
    await waitFor(() => expect(screen.getByLabelText("access")).toHaveTextContent("allowed"));
    expect(mocks.register).toHaveBeenCalledTimes(2);
  });
  it("blocks granted permission if token registration fails and allows retry", async () => {
    permission = "granted"; mocks.register.mockRejectedValue(new Error("Registration failed"));
    render(<NotificationProvider><Probe /></NotificationProvider>);
    await waitFor(() => expect(screen.getByLabelText("status")).toHaveTextContent("failed"));
    expect(screen.getByLabelText("access")).toHaveTextContent("blocked");
    mocks.register.mockResolvedValue({ ok: true }); fireEvent.click(screen.getByText("Enable"));
    await waitFor(() => expect(screen.getByLabelText("access")).toHaveTextContent("allowed"));
  });
  it("revocation blocks access on returning to the app without polling or registration", async () => {
    permission = "granted"; mocks.register.mockResolvedValue({ ok: true });
    render(<NotificationProvider><Probe /></NotificationProvider>);
    await waitFor(() => expect(screen.getByLabelText("access")).toHaveTextContent("allowed"));
    permission = "denied"; fireEvent.focus(window);
    expect(screen.getByLabelText("access")).toHaveTextContent("blocked");
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });
  it("existing off control blocks Attendance", async () => {
    permission = "granted"; mocks.register.mockResolvedValue({ ok: true });
    render(<NotificationProvider><Probe /></NotificationProvider>);
    await waitFor(() => expect(screen.getByLabelText("access")).toHaveTextContent("allowed"));
    fireEvent.click(screen.getByText("Disable"));
    await waitFor(() => expect(screen.getByLabelText("access")).toHaveTextContent("blocked"));
  });
});