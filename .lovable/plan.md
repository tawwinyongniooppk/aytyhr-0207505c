# Carousel Slider Management Module

## Overview
Add a global persistent Carousel Slider to the app, manageable by IT Manager via a new menu item. Slides are stored in Lovable Cloud and render in the Root Layout across all pages.

## Database (Lovable Cloud)

**`carousel_settings`** (single-row config table)
- position: 'top' | 'middle' | 'bottom' (default 'top')
- animation_style: 'continuous' | 'fade' | 'slide-snap' | 'pop' (default 'continuous')
- animation_speed_seconds: numeric (default 5)
- enabled: boolean (default true)

**`carousel_slides`**
- image_url, sort_order
- link_enabled (bool), link_url (text, nullable)
- start_date, end_date (nullable date pickers)
- active (bool)

RLS:
- Everyone authenticated: SELECT
- IT Manager only: INSERT/UPDATE/DELETE (via `is_it_manager()`)

GRANTs for both roles. service_role full access.

Storage: reuse `branding` bucket under `carousel/` prefix (already public).

## IT Manager Page: `/carousel-management`

Add route, sidebar/bottom-nav item (IT Manager only), and route guard in `AppLayout`.

**Settings panel:**
- Position dropdown (Top / Middle / Bottom)
- Animation Style dropdown (Continuous Scroll, Fade, Slide Snap, Pop)
- Animation Speed numeric input (seconds)
- Master enable switch

**Slide manager:**
- "Add Slide" button → upload image (enforced `aspect-[21/9] object-cover` preview)
- Per-slide card: 21:9 preview, link toggle + URL input (shown only when ON), Start/End date pickers (shadcn DatePicker), active toggle, remove button
- Reorder via sort_order (up/down buttons — keeps it simple)

## Global Component: `<GlobalCarousel />`

Mounted in `AppLayout` and positioned (top / middle / bottom) based on settings. Slim banner (no layout push for "middle" — actually middle = between header and main; top/bottom flank the main area). It renders inside the flex column so it does not overlap, but stays compact (h-auto with 21:9 aspect on a max-w container — slim banner means small height; we'll cap height ~80–120px on desktop, ~56–80px on mobile while preserving 21:9 via max-width).

**Behavior:**
- Filter slides by date window (start_date ≤ today ≤ end_date, nulls = open)
- Continuous scroll: marquee using CSS `@keyframes` translateX
- Fade: cross-fade with `transition-opacity`
- Slide Snap: embla carousel (already in project) with `align: 'start'`, autoplay
- Pop: scale-in transition between slides
- Pause on hover (desktop): pause animation/autoplay
- Touch swipe (mobile): embla handles natively for slide/fade/pop; for continuous, swipe is informational only
- Click slide → opens `link_url` in new tab when `link_enabled`

**Fetching:** loaded once via React Query with `staleTime: Infinity` (refetch only on manual refresh / mutation invalidation). One realtime-free fetch on app mount.

## Files

- `supabase/migrations/<ts>_carousel.sql` — tables, GRANTs, RLS, policies
- `src/hooks/useCarousel.ts` — React Query loaders + mutations
- `src/components/carousel/GlobalCarousel.tsx`
- `src/components/carousel/CarouselSlideCard.tsx` (admin slide editor)
- `src/pages/CarouselManagement.tsx`
- Edit `src/App.tsx` — add lazy route `/carousel-management`
- Edit `src/components/layout/AppLayout.tsx` — mount `<GlobalCarousel />`, add route to IT Manager allowlist
- Edit `src/components/layout/DesktopSidebar.tsx` + `BottomNav.tsx` — add IT Manager menu entry

## Technical Notes
- IT Manager allowlist in `AppLayout` currently restricts to `manage-accounts` and `lesson-plans-editor`; add `/carousel-management`.
- Bottom nav for IT Manager: add new icon entry.
- Image upload uses existing `branding` bucket (public) at `carousel/{uuid}.{ext}`.
- 21:9 enforcement: client-side preview only (we don't crop server-side); the `aspect-[21/9] object-cover` class guarantees consistent display.
