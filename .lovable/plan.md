
# Notification Centre (IT Manager)

A single new page for the IT Manager to compose, preview, schedule, and manage push notifications sent through the existing FCM pipeline (`fcm_tokens` + `send-push` edge function).

## Navigation
- New menu item **Notification Centre** (bell icon) in `DesktopSidebar` and `BottomNav`, visible only when `role === 'it_manager'`.
- Route: `/notification-centre` in `src/App.tsx`, lazy-loaded, wrapped in an IT-Manager guard (redirect others to `/dashboard`).

## Audience clarification
This is a staff PWA — there are no "Parents". Target Audience options will be: **All Users**, **Admins & Assistants**, **Staff only**, **IT Managers**, and **Specific Users** (multi-select from the staff directory). Tell me if you want a different set.

## Page layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Notification Centre                                          │
├───────────────────────────────┬──────────────────────────────┤
│ 1. Composer                   │ 2. Live Preview              │
│   Title / Body                │   [Mobile push banner mock]  │
│   Banner image (upload/URL)   │   [Desktop toast mock]       │
│   App icon selector           │   Layout: Minimal | Compact  │
│   Layout template toggle      │           | Image-focused    │
│                               │                              │
│ 3. On-Click Action            │                              │
│   ○ Internal route (select)   │                              │
│   ○ External URL              │                              │
│                               │                              │
│ 4. Delivery                   │                              │
│   ○ Send now  ○ Schedule      │                              │
│   Date + Time pickers (MMT)   │                              │
│   Audience selector           │                              │
│                               │                              │
│ [ Save as Draft ] [ Send / Schedule ]                        │
├──────────────────────────────────────────────────────────────┤
│ 5. Templates / Drafts / Scheduled / Sent                     │
│  Title · Audience · Status · Scheduled at · Actions          │
│  Status badge: Draft / Scheduled / Sent / Failed             │
│  Actions: Edit · Duplicate · Delete · Send now               │
└──────────────────────────────────────────────────────────────┘
```

## Data model

New table `public.notifications` (IT-Manager-only via RLS + trigger):

- `title` text, `body` text
- `banner_url` text nullable, `icon_key` text (small enum: default, alert, calendar, salary, task, leave)
- `layout` text: `minimal | compact | image_focused`
- `action_type` text: `internal | external | none`
- `action_target` text (route or URL)
- `audience` text: `all | admins | staff | it_managers | specific`
- `audience_user_ids` uuid[] (used when `audience='specific'`)
- `status` text: `draft | scheduled | sent | failed`
- `scheduled_at` timestamptz nullable
- `sent_at` timestamptz nullable, `sent_count` int, `failed_count` int, `last_error` text
- `created_by` uuid (auth.uid), timestamps

RLS: only `it_manager` can select/insert/update/delete. GRANTs for `authenticated` + `service_role`. Enable Realtime so the table auto-refreshes.

## Backend

- **Storage bucket** `notification-banners` (public read, IT-Manager write) for banner uploads.
- **Edge function `dispatch-notification`** (verify caller = IT Manager, or CRON_SECRET for scheduled sweeps):
  - Loads the notification row, resolves target user IDs from `audience`, pulls FCM tokens, fans out through the existing `send-push` helper.
  - Attaches `data.action_type`, `data.action_target`, `data.notification_id` to the FCM payload.
  - Updates `status`, `sent_at`, `sent_count`, `failed_count`, `last_error`.
- **Edge function `notification-scheduler`** run every 5 minutes by `pg_cron`: picks up rows with `status='scheduled' AND scheduled_at <= now()` and calls the dispatcher.
- All times stored as UTC, displayed/edited in Asia/Yangon.

## Click-through routing

- `public/firebase-messaging-sw.js` `notificationclick` handler: read `data.action_type` + `data.action_target`. Internal → `clients.openWindow(origin + target)`. External → open the URL directly. `none` → focus the app.
- Foreground handler in `src/hooks/useNotifications.tsx` does the same when the user taps the in-app toast.

## Composer UX

- All form state in a single `useState` object; disabled Send button until title/body/audience are valid (zod schema).
- Icon selector: 6 preset lucide icons rendered as buttons; the picked `icon_key` maps to an image in the preview and to a small icon URL in the push payload.
- Banner: drag-and-drop upload to the bucket **or** paste URL; preview updates live.
- Layout toggle changes preview only (Minimal = title + body, Compact = + small icon, Image-focused = large banner on top).
- Live preview: two side-by-side cards styled to look like an Android push banner and a desktop toast, using existing semantic tokens (`bg-card`, `text-foreground`, shadow tokens) — no hard-coded colors.

## Templates / drafts table

- Same `notifications` table filtered by `status`.
- Tabs: **All · Drafts · Scheduled · Sent**.
- Row actions: **Edit** (load into composer), **Duplicate**, **Delete** (confirm), **Send now** (only for Draft/Scheduled — flips status and invokes dispatcher).
- Sent rows show `sent_count / (sent_count + failed_count)` and `last_error` on hover.

## Files

New:
- `src/pages/NotificationCentre.tsx`
- `src/components/notifications/NotificationComposer.tsx`
- `src/components/notifications/NotificationPreview.tsx`
- `src/components/notifications/NotificationsTable.tsx`
- `supabase/functions/dispatch-notification/index.ts`
- `supabase/functions/notification-scheduler/index.ts`

Edited:
- `src/App.tsx` — route + IT-Manager guard
- `src/components/layout/DesktopSidebar.tsx`, `BottomNav.tsx` — menu entry
- `public/firebase-messaging-sw.js` — click routing
- `src/hooks/useNotifications.tsx` — foreground click routing

Migration: `notifications` table + RLS + GRANTs + storage bucket + policies.
`supabase--insert` (not migration) is used to register the `pg_cron` schedule so the anon key stays out of the migration.

## Out of scope (ask if you want them)
- Rich text / markdown in body
- A/B testing or per-user personalization tokens
- Analytics on open/click rates
