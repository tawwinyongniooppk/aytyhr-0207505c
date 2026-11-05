# Notification reliability audit

## Scope and verification
All identifiable runtime notification sources, client setup, workers, notification tables/policies, live notification-related triggers and cron schedules were inspected. Source inspection is not proof of delivery. Live authenticated/device verification is **NOT VERIFIED**: the requesting user's email has no matching app auth account; no other account was selected.

Business pushes do not create an inbox record. Notification Centre dispatch alone upserts `notification_deliveries` before push. The current notification context's unread methods remain stubs, and there is no existing inbox consumer. No inbox feature was invented.

## Report 1 — mandatory Attendance notification setup

| Check | Result | Evidence/limit |
|---|---|---|
| Permission setup | PASS (automated) | Startup uses non-prompting existing registration; explicit Enable triggers prompting path; default/denied block access. Real OS prompt NOT VERIFIED. |
| Attendance blocked without setup | PASS (automated + source) | Current-user confirmed registration, granted permission and local enabled preference are all required. Route does not mount Attendance when blocked; actions recheck before mutation. |
| Location requirement preserved | PASS (source only) | Existing GPS acquisition, location UI, server geofence, overrides and calculations unchanged. Physical geofence test NOT VERIFIED. |
| Existing Settings UI preserved | PASS (source) | On/Off and Test controls retained. Setup reuses same control, not a second settings interface. |
| Token registration/error handling | PASS (automated) | Existing function reused; coalesced clicks, failed registration/retry, permission revocation and off preference tested. Real FCM token/server registration NOT VERIFIED. |

Turning notifications off remains possible, but now makes Attendance unavailable until successful re-enablement. Unsupported browsers and embedded preview frames cannot use Attendance until push setup succeeds in a supported top-level app. Unrelated pages remain outside this gate.

## Rule matrix

**A** = Admin + Assistant Admin (not IT Manager unless explicitly configured). **S** = relevant staff/request owner. All frontend events are immediate after successful existing writes; backend events use existing scheduled invocation. Every row's actual device delivery is **NOT VERIFIED**. "Inspected" means source recipient/trigger/content inspection only, not delivery PASS.

| # | Event/condition | Expected parties | Existing title and message template | Location / destination / timing | Actual before; defect; correction; verification |
|---|---|---|---|---|---|
| 1 | Successful check-in | A; S separately only if late deduction | Staff checked in / name checked in + charged minutes and amount or on time | Attendance.tsx → /attendance; immediate | Staff→A rejected by self-only sender. Fixed owned recent attendance validation and server-derived A/content. Authorization unit tests; live NOT VERIFIED. |
| 2 | Positive check-in late deduction | S | Late Entry Deduction / minutes × rate = -deduction Ks | Attendance.tsx → /salary; immediate | Self-target allowed; unchanged. Inspected. |
| 3 | Successful check-out | A | Staff checked out / name checked out + early minutes + leave/late-excuse suffix | Attendance.tsx → /attendance; immediate | Same staff→A blocker. Fixed verified checkout event; server reads approved leave types for existing suffix. Inspected + shared authorization tests. |
| 4 | Pending leave submitted | A | New leave request / name requested type on date | Leave.tsx → /leave; immediate | Self-only blocker. Fixed owned recent pending request, derives type/date/name/A. Existing insert gets client-generated UUID, no extra client read. |
| 5 | Half-leave/manual full-leave deduction approval branch | S | Half Leave approved OR Leave approved — Manual Deduction / title — amount Ks deducted | Leave.tsx → /salary; immediate | Privileged sender path, inspected; unchanged. |
| 6 | Afternoon half-leave approval | A and S (separate messages) | A: Afternoon Half-Leave approved / name, date, checkout changed to 12 PM. S: Check-out time updated / Afternoon Half-Leave approved, checkout 12 PM | Leave.tsx → /leave and /attendance; immediate | Both sends present; no inferred missing recipient. Additional deduction message intentional/needs clarification if unwanted. Unchanged. |
| 7 | Partial-leave deduction approval | S | Partial Leave approved / minutes × rate = amount Ks deducted | Leave.tsx → /salary; immediate | Followed by general approval (#9), two different messages. Needs clarification before deduplication; unchanged. |
| 8 | Morning half-leave approval | A and S | A: Morning Half-Leave approved / name/date/check-in shifted to noon. S: Leave approved / Morning Half-Leave approved, check-in 12 PM | Leave.tsx → /leave; immediate | Both parties selected in code. Inspected, unchanged. |
| 9 | General leave approved/rejected | S | Leave approved / Your type on date was approved; morning override. Leave rejected / Your type on date was rejected | Leave.tsx → /leave; immediate | Inspected. Overlaps #7 and #8 by branch, not independently invented rules. Unchanged. |
| 10 | Pending overtime submitted | A | New overtime request / name requested OT: title | OvertimeSection.tsx → /leave; immediate | Self-only blocker. Fixed owned recent pending OT validation, derived recipients/content. Existing insert gets client UUID without extra client read. |
| 11 | Overtime approved/rejected | S | Overtime approved / title +amount MMK (minutes) added to salary; Overtime rejected / title, request rejected | OvertimeSection.tsx → /leave; immediate | Existing atomic approval and rejection path retained; notification inspected only. |
| 12 | Standalone task creation | Selected S | New task assigned / title | Tasks.tsx → /tasks; immediate | Privileged sender path. Inspected, unchanged. |
| 13 | Calendar task creation | Existing candidateIds | New task assigned / title — due deadline | CalendarPage.tsx → /calendar; immediate | Existing modes and independent assignments preserved. Inspected, unchanged. |
| 14 | Standalone task submitted/resubmitted | A | Task submitted for review OR Task resubmitted / name submitted/resubmitted: title | StaffTaskView.tsx → /tasks; immediate | Self-only blocker. Fixed caller-owned recently submitted task validation and derived content. No business transition changed. |
| 15 | Calendar assignment submitted/resubmitted | A | Same titles / name submitted/resubmitted a task | StaffTaskView.tsx → /tasks; immediate | Same blocker; fixed owned assignment validation. Does not expose or change other staff assignments. |
| 16 | Manual task/assignment approval | Relevant S | Task approved — Bonus credited / title +amount MMK; otherwise Task approved / title | AdminTaskDashboard.tsx → /tasks; immediate | Inspected, unchanged. |
| 17 | Task/assignment rejection | Relevant S | Task rejected / title + optional rejection reason | AdminTaskDashboard.tsx → /tasks; immediate | Inspected, unchanged. |
| 18 | Manual leave-day deduction inserted | Selected S | Manual Deduction Applied / title — days deducted + optional reason | ManualDeductionPanel.tsx → /salary; immediate | Inspected, unchanged. |
| 19 | Test notification clicked after registration | Current user, all registered devices | Test notification / If you can see this, push notifications are working. | PushNotificationSettings.tsx → /attendance; manual | Retained; now reuses provider's successful setup instead of repeating registration. Test button presence source-inspected; live send NOT VERIFIED. |
| 20 | Auto-checkout positive penalty | S + A, deduplicated | Forget to Check out — Auto Deduction / name, penalty MMK flat deduction Burmese text | auto-checkout → /salary; live cron 15:45 MMT daily | Both parties in same request; partial leave covering checkout suppresses message. Inspected, unchanged. Schedule not changed even though configured checkout times may differ. |
| 21 | Deadline bonus newly inserted | Owner S | Task bonus credited / bonus-row title — +amount MMK | task-deadline-sweep → /salary; 7/14/21/27 at 23:55 MMT | Existing checks/schedule preserved. Inspected, unchanged. HTTP failures are not checked by producer; central sender logs, no durable retry. |
| 22 | Auto weekly missing-manual-task credit | Eligible S | Auto Weekly Credit / window label, 1 Unit + Bonus amount auto-credited | auto-weekly-task-credit → /salary; 1/8/15/22 at 23:55 MMT | Previously announced assignment existence even on failed credit or rerun. Notification-only set tracks successful new bulk/per-row/backfill insert, suppresses repeats/failed credits. Credit calculations/writes/retry/schedule unchanged. Live checkpoint NOT VERIFIED. |
| 23 | Notification Centre Send now/retry | Configured audience: all, A, staff, IT managers, specific IDs | Composer's saved title/body/banner | NotificationComposer/NotificationsTable → dispatch-notification → send-push; manual immediate | Delivery snapshots precede FCM. No notifications currently stored at audit query. Draft save/duplicate do not send. Concurrent sends can double-dispatch; durable exactly-once needs a separate approved design. Existing behavior reported, not rewritten. |

23 event families audited; submission/resubmission and approval/rejection variants are explicitly included. This is not 23 verified successful deliveries: **0 real-device events verified**. Six staff-origin event types blocked before patch (rows 1,3,4,10,14,15); one weekly notification family falsely announced/repeated credit (22). Other inspected rows are not claimed working solely from code.

## Delivery findings and fixes

1. **Missing gate / setup state:** registration success was not available to Attendance. Provider now owns/coalesces existing registration, resets per user, exposes readiness/error, handles permission change/focus/visibility without polling. No second registration implementation.
2. **Staff→A security mismatch:** arbitrary staff messages remain self-only. Existing sender accepts only typed, valid-ID events whose record is caller-owned, current permitted state, timestamp within 5 minutes (30 seconds future tolerance); derives title/body and only A recipient IDs. Required event reads were explicitly approved. No RLS changes.
3. **Foreground handler unreachable:** raw worker never forwarded Firebase's `isFirebaseMessaging` / `push-received` protocol. Worker now forwards foreground messages for toast; worker alone displays system notification in both states, including when a window listener is not ready. Tests execute worker with mocked clients, not real push delivery.
4. **Valid tokens incorrectly removed:** sender pruned every 400/404, even malformed-message errors. Now only explicit FCM `UNREGISTERED` deletes tokens; generic 400 retained/reported. Unit-tested error bodies.
5. **Relative FCM link:** `webpush.fcm_options.link` requires HTTPS absolute URLs; existing routes were relative. Omit that optional field for relative routes, keep data.url for worker click. External HTTPS links retained. Live FCM acceptance NOT VERIFIED.
6. **Wrong window focused on click:** worker returned the first window even if unrelated origin. It now selects same-origin windows before navigating/focusing; external actions remain allowed because the composer explicitly supports them.
7. **Weekly false/repeated push:** newly successful credit inserts tracked locally solely for notification selection. No new query or financial update.

## Remaining risks / clarification

- Notification Centre concurrent dispatch read-before-send is not an atomic claim; unique delivery records do not guarantee unique pushes. Fix requires durable delivery/claim design; no new tables/columns/RPCs were introduced.
- Replaying a valid recent staff event can still dispatch again; recency/ownership is authorization, **not durable exactly-once protection**. No invented backend rate limit or new idempotency storage.
- Partial approval produces deduction and general outcome messages. Intended suppression is unclear; preserved.
- Notification Centre role-wide IT Manager access differs from an ownership comment; existing role-wide RLS is preserved pending clarification.
- Partial Centre success marks `sent` and retries skip already-sent rows, including unreached users; changing retry semantics is not inferred.
- Producers generally do not inspect non-2xx response bodies; send-push logs errors, but no durable queue/retry. A network exception from one FCM request can reject aggregation; other sends already launched are not a durable independent retry guarantee.
- On/Off is device-local and removes current token; old refreshed tokens/other devices may remain. Audit query saw 90 tokens across 16 users, not proof of stale tokens. No bulk deletion or token ownership cleanup performed.
- Source includes historical notification/cron migrations; live cron is authoritative. Live jobs: weekly 1/8/15/22 23:55, deadline 7/14/21/27 23:55, auto-checkout daily 15:45, monthly reset month-end 23:58, yearly May31 23:59 MMT. No live notification-dispatch cron or business-to-notification database trigger. Monthly/yearly resets do not emit notifications in current code.
- Local attendance salary sound/banner is distinct from FCM and remains unchanged. Badge count is worker-memory/session local, not inbox unread count.
- Real registration, OS prompts, foreground/background display, both-party delivery, physical location, authenticated routes and unrelated signed-in workflows: **NOT VERIFIED**. Sign in in preview for session-based checks; real push requires top-level published/installed app, not embedded preview.

## Workload and scope

- New database fields **0**, tables **0**, RPCs **0**, Edge Functions **0**, realtime subscriptions **0**, polling **0**, dependencies **0**, cron changes **0**, RLS changes **0**.
- **Existing backend changes:** send-push authorization/content/FCM error/link handling; auto-weekly-task-credit notification recipient filtering only.
- **New backend SELECT call sites: 3** in existing send-push: event row, caller+Admin/Assistant profiles, checkout approved-leave lookup. Per verified staff event: **2 additional reads**, checkout **3**, plus unchanged auth-role/token reads. Removed frontend administrator-list RPC from those event paths; no new client `.from`/RPC read. Same existing send-push invocation, token function, and business writes reused.
- Startup/manual setup reuses existing registration function; retries and real permission changes can register again intentionally, no polling. Focus checks do not register repeatedly while permission unchanged.
- Profile/cache/directory hooks, geofence, salary/bonus calculations, OT atomic approval, leave balances, task assignment, resets and unrelated UI not modified.
- Automated tests: permission and registration rules, provider success/failure/retry/coalescing/revocation/off state, owned/recent event checks, stale-token classification, mocked foreground/background single-display. Actual device checks remain separate.