# Frontend

React + TypeScript app bundled with Rsbuild.

## Runtime policy

- Frontend scripts use the Bun runtime by default.
- Run frontend workflows through `bun run <script>` so local `node_modules/.bin` tools are used consistently.
- Rstest runs unit, integration, and selected functional browser tests; Vitest remains for visual snapshots.
- `react-doctor` runs lint/dead-code checks.

## Scripts

- `bun run dev` - start dev server
- `bun run dev:scan` - start local dev with React Scan and the default global Compiler
- `bun run build` - build production assets
- `bun run preview` - preview the production build
- `bun run quality:gate` - run the standard full local gate with React Doctor, typecheck, build, unit tests, and integration tests
- `bun run quality:changed` - run changed-file Ultracite, React Doctor, typecheck, and changed Rstest and Vitest suites against `QUALITY_BASE_REF` (defaults to `origin/main`)
- `bun run type:check` - run the TypeScript project build check used by local hooks and CI
- `bun run doctor` - run React Doctor against the whole frontend
- `bun run doctor:full` - run React Doctor against the whole frontend
- `bun run doctor:audit` - run full React Doctor with inline suppressions ignored
- `bun run test:unit` - run unit tests with Rstest and happy-dom
- `bun run test:integration` - run integration tests with Rstest and happy-dom
- `bun run test:unit:watch` - run unit tests in Rstest watch mode
- `bun run test:integration:watch` - run integration tests in Rstest watch mode
- `bun run test:browser` - run Vitest visual tests and Rstest functional browser tests through Playwright
- `bun run test:e2e` - run Playwright end-to-end tests
- `bun run test:accessibility` - run dedicated Playwright accessibility checks with axe-core
- `bun run perf:lighthouse` - build and generate local Lighthouse HTML/JSON reports
- `bun run lint` - run canonical Biome checks
- `bun run lint:changed` - run canonical Biome checks only on changed frontend files
- `bun run lint:fix` - apply canonical Biome fixes

## Agent-friendly test output

- Rstest automatically selects its compact Markdown reporter for coding agents.
- Vitest browser tests use native reporters and preserve visual failure artifacts.
- Vitest browser mode remains because Rstest 0.11.9 does not support the screenshot assertions used by the visual regression suite.
- Playwright local runs use a compact reporter; CI uses the built-in list reporter plus failure artifacts.

### Agent boundaries

This README is agent-facing documentation under `frontend/**/*{.md,_agent.{js,ts,json},agent.{config,schema}.{js,ts,json}}`.

- Allowed: inspect files, run `bun run lint`, `bun run type:check`, `bun run test:*`, compare screenshots, and propose patches.
- Forbidden without human approval: read secrets, call production services, deploy, mutate schemas, or push/commit changes outside an explicit user request.
- Required checkpoint: get or rely on explicit human instruction before pushing code, refreshing baselines, or changing CI behavior.
- Escalate when a test requires credentials, network access beyond package/GitHub tooling, or a snapshot change whose UX intent is unclear.

## Lint and format consistency

- This repository uses Biome as the single source of truth for formatting and linting.
- Workspace settings force Biome in Cursor/VS Code and disable Prettier for this project.
- The editor is pinned to the local `node_modules` Biome binary to avoid version drift.
- Commit hook (`lefthook`) and CI both run Biome, so all contributors get the same output path.
- Commit messages should follow the repository Conventional Commits policy from the root `AGENTS.md`.

## Troubleshooting

- Run most frontend workflows through `bun run <script>` from the `frontend` directory.
- Use `bun run <script>` for `quality:gate`, `test:integration*`, and `test:browser*`.
- Another package manager can bypass Bun runtime enforcement.

## Stack

- Rsbuild + Rspack
- React 19
- TanStack Router file-based routing
- Tailwind CSS 4
- Rstest (unit/integration/functional browser) + Vitest browser mode (visual regression) + Playwright (e2e)

## Diagnostics

- Runtime diagnostics stay in local app error states and tests.
- Production builds do not upload source maps or initialize external product analytics/error tracking clients.
