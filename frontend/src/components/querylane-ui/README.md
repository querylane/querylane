# Querylane UI extensions

Keep `src/components/ui/*` as shadcn registry output. Put Querylane-specific variants, forks, and wrappers here instead.

Prefer thin wrappers around `@/components/ui/*`. Only fork shadcn internals here when the upstream UI component does not expose the behavior as props or class hooks.

Wrapper modules should export the whole matching component family so consumers import from 1 place, for example `Sidebar` and `SidebarProvider` both from `@/components/querylane-ui/sidebar`.

SQL highlighting is Querylane-owned, not a shadcn registry item. Its implementation
and tests live here alongside the Bash highlighter.

The sidebar combobox and navigation drawer also live here. They preserve the
popup-contained search, asynchronous database selection, horizontal swipe and
reduced-motion behavior. Import their complete families from
`@/components/querylane-ui/combobox` and `@/components/querylane-ui/drawer`, not
the registry's input-first combobox or snap-point drawer. Their existing consumer
props and behavior are unchanged.
The non-component `createComboboxItems` helper has a direct import from
`@/components/querylane-ui/combobox-items` so component modules support Fast Refresh.

## Lint contracts

Use finite `presentation` variants for Querylane appearance; keep consumer
`className` values limited to layout. Registry `variant` and `size` props still
apply. Add reusable semantic choices, not unrestricted class-valued props.

Oxlint discovers both UI directories. Like the upstream registry preset,
Querylane component authors may compose sibling appearance and variant functions.
Raw colors, arbitrary values, inline styles, and unknown classes remain checked
here; every shadcn rule remains enabled for consumers. The external class markers
in `oxlint.config.ts` name actual stylesheet or library interaction contracts.
