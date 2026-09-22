# FE-1 Lightweight Premium Micro-Interactions

## Scope
Apply frontend-only interaction polish through existing shared UI controls and styles. Preserve all data operations, permissions, calculations, validation, navigation destinations, and PWA behavior.

## Implementation
- Refine shared buttons with short press feedback, focus polish, and loading-icon motion only while already loading.
- Refine shared tabs with smooth active-state emphasis and subtle content entrance without delaying tab changes.
- Polish dialogs, alert dialogs, sheets, drawers, menus, selects, toasts, accordions, and collapsible panels with short opacity/scale/translate transitions.
- Improve inputs, text areas, switches, checkboxes, radios, toggles, and invalid-field feedback using semantic theme colors.
- Keep card lift opt-in for interactive cards only; leave informational cards static.
- Refine desktop and mobile navigation active/press states while preserving current routes and layout.
- Add a global reduced-motion override that disables non-essential motion while retaining focus and interaction states.
- Reuse existing submit/approve/reject/save loading indicators and labels; do not add independent success timers or duplicate request state.

## Technical safeguards
- No backend, database, query, mutation, authentication, authorization, calculation, cron, realtime, or PWA service-worker changes.
- No new packages, network calls, polling, timers, requestAnimationFrame loops, or animation libraries.
- Use CSS transitions/keyframes and current component state only.
- Keep durations approximately 100–220ms and use existing semantic color tokens for future theme compatibility.

## Validation
- Run focused tests and TypeScript checks.
- Confirm the production preview build succeeds.
- Verify representative desktop and mobile interactions and reduced-motion behavior.
- Confirm dependency files and backend files remain unchanged.
