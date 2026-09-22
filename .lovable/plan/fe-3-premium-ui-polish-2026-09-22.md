# FE-3 — Premium UI Polish

## Goal
Polish the existing HRM interface through restrained, theme-aware shared styling while preserving every route, permission, handler, validation rule, data operation, loading condition, and FE-1/FE-2 behavior.

## Implementation
- Refine shared cards, buttons, badges, alerts, tables, form controls, tabs, dialogs, and toasts for clearer hierarchy, consistent spacing, subtle borders, restrained shadows, and semantic state treatment.
- Add reusable presentation classes for page headings, section headings, metadata, empty states, metric blocks, and status pills so existing screens gain consistency without page rewrites.
- Polish desktop sidebar and mobile navigation alignment, touch targets, active indicator, selected icon emphasis, safe-area spacing, and theme-aware states without changing role filtering or routes.
- Improve the real application loading shell and existing CSS skeletons only; no fake states, delays, timers, or continuous shimmer.
- Apply a small number of surgical presentation-only updates to representative high-use areas where shared primitives cannot cover existing custom markup, prioritizing Dashboard and existing table/empty-state patterns.
- Preserve success, warning, destructive, and informational meaning independently from the selected FE-2 color preset.

## Technical safeguards
- Frontend presentation files only: shared UI components, layout components, global semantic CSS/tokens, and narrowly selected existing page markup.
- No backend files, database changes, queries, mutations, RPCs, API/fetch calls, realtime, polling, cache behavior, auth, business logic, PWA behavior, or dependencies.
- Reuse FE-1 motion only: 100–220ms opacity, color, border, shadow, and small transform transitions; retain the global reduced-motion override.
- Use existing semantic tokens for all theme-sensitive details and preserve all eight FE-2 presets in Light and Dark modes.

## Validation
- Run TypeScript checks and existing tests; confirm the production preview build succeeds.
- Verify representative desktop/mobile navigation, Dashboard, cards, buttons, forms, tables, badges, dialogs, toasts, loading, empty, selected, and focus states.
- Check all 16 Light/Dark and color-preset combinations, local theme persistence, FE-1 interactions, and reduced-motion behavior.
- Inspect changed files and manifests to confirm zero backend, network/data-operation, PWA, or dependency changes; report any visual item skipped by the hard-stop rule.
