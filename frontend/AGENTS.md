## Quality checks
For every frontend change, make sure you run formatter, linter, type checker, build, and tests, before you commit.

<!-- opensrc:start -->

## Source code reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally instead of stopping at its types or interface.

### Fetching additional source code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package, for example: npx opensrc zod
npx opensrc <owner>/<repo>      # GitHub repository, for example: npx opensrc vercel/ai
```

<!-- opensrc:end -->

## Toolchain

- Use `bun` as package manager (not npm/npx)
- Use TypeScript 7's native `tsc` for type checking
- Do not install eslint or prettier (this project uses Biome)
- Do not use `rm -rf` except for: node_modules, dist, .next, build, .cache, .turbo, coverage
- Do not use `git push --force` (use `--force-with-lease`)
- Do not use `git reset --hard`

## Commit format

All commits must follow: `type(scope): description`
- **Types**: feat, fix, refactor, style, test, docs, chore, perf, ci, build, revert
- **Scope** required, for example: `feat(frontend):` or `fix(frontend):`
- Description: lowercase first letter, no trailing period, 5-72 chars

## Code quality

- Run `bun run lint:fix` before finishing
- Run `bun run type:check` before finishing
- Do not add heavy dependencies to production: moment (use date-fns), lodash (use lodash-es), jquery, core-js, classnames (use clsx)
- Use kebab-case for all filenames (`my-component.tsx`, not `MyComponent.tsx`)

## React rules

- Use functional components only. React Compiler requires them.
- Use components from `@/components/ui/` instead of raw interactive HTML elements such as `<button>`, `<input>`, or `<select>`.
- Do not use `dangerouslySetInnerHTML` without DOMPurify
- Do not use `eval()` or `new Function()`
- Do not assign `.innerHTML` directly
- Do not use TypeScript escape-hatch casts or suppression comments; fix the types instead
- Do not remove focus outlines (`outline: none`)
- Do not use manual `useMemo` / `useCallback` / `React.memo` (React Compiler handles this)
- Icon-only buttons must have `aria-label`
- Buttons must have onClick, asChild, type="submit", or disabled
- Prefer `<Link>` over `onClick + navigate()`
- Import directly from source files instead of using barrel imports (re-exports from index files).
- Use `{ passive: true }` on `addEventListener('scroll'|'touchstart'|'wheel')`
- Use dynamic `import()` or `React.lazy()` for heavy deps (`chart.js`, `d3`, `three.js`, `pdf-lib`)
- When writing `useEffect`, use named function expressions: `useEffect(function syncDocumentTitle() { ... }, [title])`

## Tailwind CSS

- Use Tailwind utility classes instead of inline `style={{}}`.
- Use design tokens instead of raw hex or RGB colors in `className` or CSS.
- Fix specificity instead of using `!important`.
- Use a `variant` prop instead of overriding visual styles (`bg-*`, `text-*`, `border-*`) on registry components.

## Environment variables

- Import environment variables from `@/env`, which validates them with t3-env and Zod. Do not access `process.env.X` directly.
- All env vars must be declared in `src/env.ts`

## Accessibility

- All `<img>` must have `alt` attribute
- Clickable `<div>` / `<span>` must have `role`, `tabIndex`, and keyboard handler
- `role="combobox"` requires `aria-expanded` and `aria-controls`
- `role="dialog"` requires `aria-label` or `aria-labelledby`
- `role="tablist"` requires child `role="tab"` elements

## Zustand

- Use `create<T>()()` double-parens (not `create<T>()`)
- Use `useShallow` for multi-value selectors
- Use `persist` middleware instead of direct localStorage

## State and data

- Use zustand for client state, TanStack Query for server state
- Do not use raw `useQuery` / `useMutation` when ConnectRPC is available (exception: `useTransport`/`callUnaryMethod` pattern with `@connectrpc/connect` imports)
- Protobuf v2: use `create(Schema, { ... })`. Do not construct messages as object literals with `$typeName`.
- Protobuf v2: use Standard Schema + protovalidate as react-hook-form resolver instead of duplicating validation in Zod
