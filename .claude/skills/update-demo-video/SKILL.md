---
name: update-demo-video
description: Re-record and re-render the README demo GIF (docs/media/querylane-demo.gif) after UI/feature changes, using the Remotion + Playwright project in demo-video/.
---

# Update the Querylane demo video

The README hero GIF is generated, not hand-recorded. Everything lives in `demo-video/`.
Use this skill when the UI changed, a feature should be added/removed from the demo,
or the GIF looks stale.

## Design constraints (agreed with the maintainer)

- **Audience is technical** (engineers, DBAs). No intro/outro cards, no marketing copy,
  no captions/subtitles. Just the product.
- **Static frame, no camera moves.** Zooms/pans were tried and rejected. The only effects
  are the rendered cursor (eased glides, press squash, click ripple) and eased scrolling.

- **Short**: ~20–25 s. High-level overview, not a feature tour. Current beats:
  instance overview → Data Explorer objects → `orders` grid → one filter rule
  (`amount > 200`) → foreign-key popover → Indexes → Definition tab.
- **One continuous take**, recorded after a warm-up pass so there are no reloads,
  spinners, or cuts. Never `page.goto()` inside `take()`.
- **Output**: 1280×720 mp4 (local only) → GIF 960 px / 12 fps / 128 colours / gifsicle
  lossy 60, **≤ 6 MB** (`gif.ts` enforces this). GitHub READMEs can't inline-play a
  committed mp4, so the GIF is the artifact; the mp4 is gitignored.

## Workflow

1. Prereqs (once): `cd demo-video && bun install && bunx playwright install chromium`;
   `ffmpeg` and `gifsicle` on PATH (`brew install ffmpeg gifsicle`).
2. Edit the scripted session in `demo-video/record.ts` → `take(page, mark)`.
   - Use the helpers: `glide`, `clickAt`, `clickSel`, `typeSlow`, `smoothWheel`, `settle`.
     They log cursor events to `src/cursor.json`; do **not** use raw `page.mouse`/`page.click`
     for anything visible or the rendered cursor will desync.
   - Selectors: prefer ARIA (`getByRole`) names from the frontend source. Gotchas: filter
     popover is `[role="dialog"][aria-label^="Filter"]` (label includes the table name);
     operator options are display labels ("Greater than"), use `:visible` on `[role="option"]`;
     FK cells are buttons named `Open <col> reference <value>`; tab names carry count badges
     (`/^Indexes/`).
   - If a new screen is added, also visit it in the warm-up section of `main()` so it's cached.
3. `bun run record` — prints take length. Set `TAKE_SEC` in `src/Demo.tsx` to roughly
   (take length − 0.3 s) so the GIF doesn't end on a frozen frame.
4. `bun run render` then `bun run gif` (or `bun run build` for all three).
5. Verify before committing: extract a few frames
   (`ffmpeg -ss <t> -i out/querylane-demo.mp4 -frames:v 1 f.jpg`) and check
   - cursor is visible and lands on the right controls (timestamp sync),
   - no loading spinners / blank states / reloads,
   - demo data looks sane (the demo env has a live workload; timestamps will differ).
   Then open `out/querylane-demo.mp4` for the maintainer to review — **they review before
   anything is committed or pushed.**
6. Commit `docs/media/querylane-demo.gif` (+ any `demo-video/` source changes). The README
   embed (`README.md`, above "## Features") does not need to change.

## Tuning knobs

- Cursor look/speed: `src/Cursor.tsx` (size, easing bezier, ripple), `glide()` durations in `record.ts`.
- Size budget: `WIDTH`/`FPS`/`COLORS`/`LOSSY` in `demo-video/gif.ts`. Prefer shortening the
  take over dropping below 960 px — text legibility matters more than frame rate.
- Output resolution: `src/theme.ts` (`WIDTH`/`HEIGHT`); the take is always 1920×1080 @2×.
