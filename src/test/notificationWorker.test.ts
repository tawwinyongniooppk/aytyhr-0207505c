import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it, expect, vi } from "vitest";

function worker(windows: unknown[]) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const clients = { matchAll: vi.fn().mockResolvedValue(windows), openWindow: vi.fn() };
  const self = {
    location: { origin: "https://hr.example" }, navigator: {}, clients,
    registration: { showNotification }, skipWaiting: vi.fn(),
    addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler; },
  };
  runInNewContext(readFileSync("public/firebase-messaging-sw.js", "utf8"), { self, clients, URL, console });
  async function push() {
    let done = Promise.resolve();
    handlers.push({ data: { json: () => ({ notification: { title: "Existing alert", body: "Existing body" }, data: { url: "/leave" } }) }, waitUntil: (p: Promise<void>) => { done = p; } });
    await done;
  }
  return { push, showNotification };
}

describe("existing messaging worker display", () => {
  it("forwards foreground messages and displays exactly one system notification", async () => {
    const postMessage = vi.fn();
    const w = worker([{ url: "https://hr.example/leave", visibilityState: "visible", postMessage }]);
    await w.push();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ isFirebaseMessaging: true, messageType: "push-received" }));
    expect(w.showNotification).toHaveBeenCalledTimes(1);
  });
  it("displays exactly one background notification with original content", async () => {
    const w = worker([]);
    await w.push();
    expect(w.showNotification).toHaveBeenCalledTimes(1);
    expect(w.showNotification).toHaveBeenCalledWith("Existing alert", expect.objectContaining({ body: "Existing body", data: expect.objectContaining({ url: "/leave" }) }));
  });
});