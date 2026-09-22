# FE-2 — User Theme Color System

## Goal
Add eight polished color presets that work independently with the existing Light/Dark Mode. Theme changes apply instantly, persist only in the current browser, and never contact the backend.

## User experience
- Add a compact Appearance control to the existing shared app header so Staff, Assistant Admin, Admin, and IT Manager can all reach it.
- Keep the existing Light/Dark toggle behavior intact inside the appearance control.
- Show Ocean, Violet, Emerald, Sky, Rose, Amber, Pink, and Slate as touch-friendly preset swatches in a responsive grid.
- Show each preset’s name plus a visible check mark and selected border; support keyboard navigation and accessible labels.
- Apply changes immediately with FE-1’s subtle color transitions, no Save button, reload, loading state, or layout movement.

## Theme architecture
- Extend the current local theme hook with a validated `ThemeColor` preference and safe localStorage reads/writes.
- Apply the selected preset as a single `data-color-theme` attribute on the document root before React renders, preventing a startup color flash.
- Define light and dark semantic token values centrally in `src/index.css`; preserve independent success, warning, and destructive colors.
- Reuse existing `primary`, `accent`, `ring`, sidebar, border, and selected-state tokens so buttons, navigation, tabs, controls, focus rings, and subtle card accents inherit the chosen theme without page-by-page rewrites.
- Keep Ocean as the default so missing, blocked, or corrupted localStorage safely falls back to the current professional blue appearance.

## Scope and files
- Update the existing local theme hook and startup application code.
- Add one small shared appearance selector component.
- Integrate it only into the shared app header.
- Extend global semantic color tokens and, only if necessary, the existing Tailwind token aliases.
- Do not modify database, migrations, backend configuration, queries, mutations, auth, business rules, PWA/service-worker behavior, or dependencies.

## Validation
- Run TypeScript checks and existing tests; rely on the platform production build result.
- Verify all eight presets in both Light and Dark Mode on desktop and mobile.
- Verify active navigation, buttons, tabs, fields, switches, checkboxes, dialogs, selected states, and focus indicators inherit semantic theme colors.
- Verify persistence after a fresh browser context using the same stored preference, no page reload on selection, reduced-motion behavior, and no theme-triggered network requests.
- Inspect changed files and dependency manifests to confirm no backend files, backend calls, polling, subscriptions, animation libraries, or new dependencies were introduced.
