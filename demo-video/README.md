# Querylane demo video

Produces the README demo GIF (`docs/media/querylane-demo.gif`) from a real,
scripted session against https://demo.querylane.net.

```sh
bun install            # once; also: brew install gifsicle, bunx playwright install chromium
bun run build          # record -> render -> gif
```

Steps (`bun run build` runs all three):

| step            | what it does                                                                                  | output                          |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------- |
| `bun run record`| Playwright drives the demo env headless at 1920×1080 @2×, captures a CDP screencast, logs cursor events | `public/clips/take.mp4`, `src/cursor.json` |
| `bun run render`| Remotion composes the take + rendered cursor + watermark at 1280×720                          | `out/querylane-demo.mp4`        |
| `bun run gif`   | ffmpeg palette GIF + gifsicle lossy; fails if > 6 MB                                          | `docs/media/querylane-demo.gif` |

`bun run studio` opens Remotion Studio for live preview.

Files:

- `record.ts` — the scripted take (`take()`), warm-up pass, cursor/scroll helpers.
- `src/Cursor.tsx` — synthetic cursor (eased moves, press squash, click ripple).
- `src/Screen.tsx` — static full-frame composition + watermark.
- `src/theme.ts` — output size / fps.

See `.claude/skills/update-demo-video/SKILL.md` for the update workflow.
