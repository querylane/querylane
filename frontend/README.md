# Frontend

React + TypeScript app bundled with Rsbuild.

## Runtime Policy

- Frontend scripts are intentionally Bun-runtime first.
- Run frontend workflows through `bun run <script>` so local `node_modules/.bin` tools are used consistently.
- Vitest runs under Node (not Bun) for unit, integration, and browser tests.
- `react-doctor` runs lint/dead-code checks.

## Scripts

- `bun run dev` - start dev server
- `bun run build` - build production assets
- `bun run preview` - preview the production build
- `bun run quality:gate` - run the standard full local gate with React Doctor, typecheck, build, unit tests, and integration tests
- `bun run quality:changed` - run changed-file Ultracite, React Doctor, typecheck, and changed Vitest suites against `QUALITY_BASE_REF` (defaults to `origin/main`)
- `bun run type:check` - run the TypeScript project build check used by local hooks and CI
- `bun run doctor` - run React Doctor against the whole frontend
- `bun run doctor:full` - run React Doctor against the whole frontend
- `bun run doctor:audit` - run full React Doctor with inline suppressions ignored
- `bun run test:unit` - run unit tests with Vitest in the Node environment
- `bun run test:integration` - run integration tests with Vitest (happy-dom)
- `bun run test:vitest` - run the unit, integration, and browser Vitest projects in one labeled project run
- `bun run test:watch` - run unit and integration watch mode together
- `bun run test:browser` - run visual browser tests with Vitest + Playwright browser provider
- `bun run test:e2e` - run Playwright end-to-end tests
- `bun run test:accessibility` - run dedicated Playwright accessibility checks with axe-core
- `bun run perf:lighthouse` - build and generate local Lighthouse HTML/JSON reports
- `bun run lint` - run canonical Biome checks
- `bun run lint:changed` - run canonical Biome checks only on changed frontend files
- `bun run lint:fix` - apply canonical Biome fixes

## AI-Friendly Test Output

- Vitest local runs use the default reporter; CI scripts call Vitest directly with the native verbose reporter so failures include test names, project labels, and runtimes without custom wrappers.
- Playwright local runs use a compact reporter; CI uses the built-in list reporter plus failure artifacts.

### Agent boundaries

This README is agent-facing documentation under `frontend/**/*{.md,_agent.{js,ts,json},agent.{config,schema}.{js,ts,json}}`.

- Allowed: inspect files, run `bun run lint`, `bun run type:check`, `bun run test:*`, compare screenshots, and propose patches.
- Forbidden without human approval: read secrets, call production services, deploy, mutate schemas, or push/commit changes outside an explicit user request.
- Required checkpoint: get or rely on explicit human instruction before pushing code, refreshing baselines, or changing CI behavior.
- Escalate when a test requires credentials, network access beyond package/GitHub tooling, or a snapshot change whose UX intent is unclear.

## Lint/Format Consistency

- This repo uses Biome as the single source of truth for formatting + linting.
- Workspace settings force Biome in Cursor/VS Code and disable Prettier for this project.
- The editor is pinned to the local `node_modules` Biome binary to avoid version drift.
- Commit hook (`lefthook`) and CI both run Biome, so all contributors get the same output path.
- Commit messages should follow the repository Conventional Commits policy from the root `AGENTS.md`.

## Troubleshooting

- Run most frontend workflows through `bun run <script>` from the `frontend` directory.
- Use `bun run <script>` for `quality:gate`, `test:integration*`, and `test:browser*`.
- If you invoke scripts via another package manager, Bun runtime enforcement may be bypassed by that runner.

## Stack

- Rsbuild + Rspack
- React 19
- TanStack Router file-based routing
- Tailwind CSS 4
- Vitest (unit/integration/browser) + Playwright (e2e)

## Sentry

Sentry is enabled for production builds only and is configured through public env vars:

- `PUBLIC_SENTRY_DSN`
- `PUBLIC_SENTRY_ENVIRONMENT`
- `PUBLIC_SENTRY_RELEASE`
- `PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (default `0.02`)
- `PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE` (default `0.1`)
- `PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE` (default `1`)
- `PUBLIC_SENTRY_ENABLE_LOGS` (`1` to enable logs)
- `PUBLIC_SENTRY_ENABLE_CONSOLE_LOG_INTEGRATION` (`1` to forward selected console logs)
- Spans are intentionally limited to boundary layers (router navigation and transport/API) to reduce noise.

## PostHog

PostHog is enabled for production builds when configured in the environment.

### Local usage

- Add your PostHog host and key to your local `.env` file.
- Leave values empty to disable PostHog locally without code changes.

### Source maps and releases

- CI build sets `PUBLIC_SENTRY_RELEASE` to the commit SHA.
- Source maps and release metadata are uploaded during `bun run build` via `@sentry/webpack-plugin` when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are present.
- CI does not run a separate Sentry CLI upload step.
- Frontend build output uses hidden source maps in production.
- Sentry correlation uses the `posthog_session_id` tag to link errors with PostHog sessions.
