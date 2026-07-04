# Querylane UI extensions

Keep `src/components/ui/*` as shadcn registry output. Put Querylane-specific variants, forks, and wrappers here instead.

Prefer thin wrappers around `@/components/ui/*`. Only fork shadcn internals here when the upstream UI component does not expose the behavior as props or class hooks.

Wrapper modules should export the whole matching component family so consumers import from one place, for example `Sidebar` and `SidebarProvider` both from `@/components/querylane-ui/sidebar`.
