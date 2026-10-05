# My ID Living Glass Animation

## Scope
Enhance only the existing Virtual ID card lighting in `src/index.css`. Preserve card markup, dimensions, responsive layout, displayed information, and PNG download behavior.

## Implementation
- Keep the current glass background and add a low-opacity edge flare using a masked conic-gradient border layer.
- Rotate only the edge-light layer on a slow loop so light travels around the perimeter without moving card content.
- Add a restrained border/glow breathing animation with a long, calm cycle.
- Convert the existing sheen into an occasional, narrow, translucent sweep with a long pause between passes.
- Use CSS keyframes only; no JavaScript, packages, timers, requests, or data-layer changes.
- Explicitly disable all three continuous effects under `prefers-reduced-motion: reduce`.

## Validation
- Confirm the app compiles and the My ID card keeps its existing size and content structure.
- Check desktop, tablet, and mobile layouts.
- Confirm the edge flare, breathing, and occasional sweep animate without moving card content.
- Confirm reduced-motion renders a clean static card.
- Confirm no backend, queries, RPCs, realtime, polling, dependencies, or Save Virtual ID code changed.
