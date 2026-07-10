# Querylane showcase video

A [Remotion](https://remotion.dev) video for the landing page, built from real
captures of https://demo.querylane.net.

## Workflow

```sh
# 1. Re-capture screenshots + interaction clips from the live demo
#    (uses Playwright from frontend/node_modules)
bun run capture

# 2. Preview / edit scenes interactively
bun run studio

# 3. Render to out/querylane-showcase.mp4
bun run render
```

## Structure

- `capture/capture.mjs` — Playwright script that grabs dark-mode 2x stills and
  1080p interaction recordings into `public/`.
- `src/showcase.tsx` — the scene timeline (durations, titles, feature chips).
- `src/scenes.tsx` — scene implementations (intro, screenshot/clip scenes,
  config-as-code, outro).
- `src/components.tsx` — logo mark, browser frame, chips, Ken Burns helpers.
- `src/theme.ts` — product palette (zinc + blue accent).

## Notes

- The demo instance is seeded by `docker-compose.seed.yaml` / `seed/`; if the
  demo data changes, re-run the capture step before rendering.
- The role access-map deep link uses the base64url-encoded role name as the
  role id (e.g. `demo_readonly` → `ZGVtb19yZWFkb25seQ`).
