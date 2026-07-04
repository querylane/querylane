# ADR: Frontend URL state policy

## Status

Accepted

## Context

Querylane pages should be bookmarkable and shareable without turning the URL into a full replay log of every UI detail. URL state also feeds pageview observability, so search params must stay small, readable, and safe.

## Decision

URLs carry stable, time-saving UX state only.

Allowed by default:

- route/path params for stable resource identity, such as `instanceId` and `databaseId`
- `q` for simple search text
- `state` for lifecycle/status/state filters
- `type` for resource or object type filters

Allowed case-by-case:

- `tab` when the tab is a meaningful sub-view
- `view` when it represents the primary page mode
- `range`, `from`, and `to` for observability or time-series pages

Avoid by default:

- pagination tokens or page numbers
- page size
- advanced or structured filters
- credentials, DSNs, secrets, and form drafts
- ephemeral UI state, including dialogs, popovers, hover, focus, toasts, and copied state
- verbose encoded blobs
- full data grid replay state
- sort, unless there is a clear bookmark/share UX win

URL-backed state is the source of truth. Do not duplicate URL params into local React `useState`; derive them from route-owned search params or a URL-state hook and write changes back to the URL. Empty/default values should be omitted.

Prefer TanStack Router for route-owned search params and route dependencies. Use `nuqs` only for simple leaf-component ergonomics, such as a local table search box backed by `q`.

Typing into simple search fields should use `history: replace` or equivalent behavior so every keystroke does not create a browser history entry.

## Current applications

- Data Explorer keeps schema, object category/type, and object name in the URL because those are stable resource identity.
- Data Explorer must not add pagination, page size, selected row drawers, advanced table filters, or full grid replay state as part of this policy.
- Instance database and role list search use `q`, omit empty values, and update via replacement history.
