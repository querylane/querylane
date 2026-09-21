# Querylane UI extensions

Keep `src/components/ui/*` as shadcn registry output. Put Querylane-specific variants, forks, and wrappers here instead.

Prefer thin wrappers around `@/components/ui/*`. Only fork shadcn internals here when the upstream UI component does not expose the behavior as props or class hooks.

Wrapper modules should export the whole matching component family so consumers import from 1 place, for example `Sidebar` and `SidebarProvider` both from `@/components/querylane-ui/sidebar`.

SQL highlighting is Querylane-owned, not a shadcn registry item. Its implementation
and tests live here alongside the Bash highlighter.

## Lint contracts

Use finite `presentation` variants for Querylane appearance; keep consumer
`className` values limited to layout. Registry `variant` and `size` props still
apply. Add reusable semantic choices, not unrestricted class-valued props.

Oxlint discovers both UI directories. Like the upstream registry preset,
Querylane component authors may compose sibling appearance and variant functions.
Raw colors, arbitrary values, inline styles, and unknown classes remain checked
here; every shadcn rule remains enabled for consumers. The external class markers
in `oxlint.config.ts` name actual stylesheet or library interaction contracts.
