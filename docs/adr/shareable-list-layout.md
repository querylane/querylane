# ADR: Shareable list sorting and column order

## Status

Proposed

## Decision

Keep the existing URL `columns` visibility sets. Add `columnOrder` and
`listSort`, each keyed by the same stable list identity. Column order preserves
sequence, drops duplicate or removed IDs, and appends newly available columns.
Sort entries preserve priority and direction; IDs must refer to supported
columns. Shape, direction and size are validated at the root route.

The URL is authoritative. Metadata defaults are omitted; an explicit empty sort is kept
when needed to override a list's default sorting. Existing visibility-only URLs
remain valid. Filters, other lists and the current pathname survive changes.
Reset columns clears visibility and order atomically, not row sorting.

Metadata inventories sort their received rows before UI pagination. Custom
ledgers keep header, body and summary cells in the same real DOM order. Column
visibility keeps the existing compact checkbox dropdown, without movement
buttons or a separate management popover. Native data grids retain drag ordering. Actions and composite columns without sortable accessors are not
given misleading sort controls. Protobuf timestamps compare seconds and nanos,
not object identity or formatted dates.

Table-data and materialized-view grids retain server-side sorting through
validated ReadRows ordering. Sort changes reset continuation tokens, and sorting
remains part of the query identity. URL column order overrides personal layout
without altering the opt-in visible-column SQL projection preference. Explicit
grid orders are retained even when they match catalog order, so a recipient's
personal order cannot silently override a shared choice. Reset clears that choice.
Column movement alone does not change read masks or response projections.

SQL/workbench results support display-only sorting and ordering. They never
wrap, rewrite or execute SQL on a layout change or reload. Sorting uses the
received result, stable ties and exact decimal comparisons; nulls stay last.
It does not reproduce PostgreSQL collations or sort hidden full values behind
truncated previews. The original SQL, complete backing values and workbench
export remain intact; workbench export retains the original result order.

## Scope and verification

The route matrix in `frontend/e2e/tests/list-column-selection.spec.ts` covers
selection, sorting, reload and reset for the tabular list inventory
from the column-selection change. SQL results require an explicit Run after
reload. Metadata sorts only received catalog/activity/insight samples; it cannot
order rows outside a server's truncated response. Navigation trees, charts and
card inventories have no column-layout contract.

No API, generated-code, database migration or dependency changes are required.
Read-mask dependencies remain complete, including hidden sort fields. A small
explicit core-bundle feature allowance covers the new shared controls/state;
initial-load, SQL-editor and largest-async budgets are unchanged.
