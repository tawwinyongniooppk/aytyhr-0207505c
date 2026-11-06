# My ID visual redesign
- [x] Refine live card layout and CSS-only lighting without changing data loading.
- [x] Redesign existing Canvas download as a complete static print card.
- [x] Verify isolated sample rendering at 360/768/1280px, reduced motion, zero download requests, and complete 1200×2280 PNG.
- [ ] Verify actual signed-in employee photo/logo and download through My ID; blocked because no requesting-user auth account matches and no session is available.

# Notification reliability
- [x] Inspect notification sources and live schedules; document the 23-event-family matrix and remaining risks in notification-audit.md.
- [x] Gate Attendance on notification permission and successful existing device registration, retaining location enforcement and notification controls.
- [x] Deploy targeted sender and weekly notification fixes; 13 focused tests passed and latest automatic app checks passed.
- [ ] Verify authenticated Attendance/setup, real token registration, and foreground/background/both-party delivery; blocked by unavailable authorized session and real-device environment.
- [ ] Resolve Notification Centre concurrency/replay and ambiguous duplicate-message rules; blocked pending explicit delivery/idempotency design approval or intended-rule clarification.