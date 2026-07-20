import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  type DataTableColumnDef,
  SortableHeader,
} from "@/components/ui/data-table";
import { deriveMetadataToolbar } from "@/features/data-explorer/explorer-table-detail/metadata";
import {
  CONSTRAINT_TYPE_LABELS,
  presentConstraintKindOptions,
} from "@/features/data-explorer/explorer-table-detail/options";
import {
  FacetFilterBar,
  MetadataTabResult,
  Pill,
  TabError,
  TabSkeleton,
} from "@/features/data-explorer/explorer-table-detail/shared-ui";
import type { useListTableConstraintsQuery } from "@/hooks/api/table";
import {
  parseResourceLeafId,
  parseTableQualifiedName,
} from "@/lib/console-resources";
import { cn } from "@/lib/utils";
import type { TableConstraint } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { ConstraintType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const KEY_CONSTRAINT_TYPES = new Set<ConstraintType>([
  ConstraintType.PRIMARY_KEY,
  ConstraintType.UNIQUE,
]);
const NOT_VALID_DEFINITION_PATTERN = /(?:^|\s)NOT\s+VALID\s*;?\s*$/i;

function isKeyConstraint(constraint: TableConstraint) {
  return KEY_CONSTRAINT_TYPES.has(constraint.type);
}

function isForeignKeyConstraint(constraint: TableConstraint) {
  return constraint.type === ConstraintType.FOREIGN_KEY;
}

function formatConstraintColumns(columnNames: string[]) {
  return columnNames.length > 0 ? columnNames.join(", ") : "—";
}

function hasNotValidDefinition(constraint: TableConstraint) {
  return NOT_VALID_DEFINITION_PATTERN.test(constraint.definition);
}

function parseReferencedTableTarget(referencedTable: string) {
  if (!referencedTable) {
    return null;
  }
  try {
    const { schema, table } = parseTableQualifiedName(referencedTable);
    return { label: `${schema}.${table}`, schema, table };
  } catch {
    return null;
  }
}

function ReferencedTableTarget({
  databaseId,
  instanceId,
  referencedTable,
}: {
  databaseId: string;
  instanceId: string;
  referencedTable: string;
}) {
  const target = parseReferencedTableTarget(referencedTable);
  if (!target) {
    return referencedTable ? (
      <ConstraintBadge tone="ghost">
        {parseResourceLeafId(referencedTable)}
      </ConstraintBadge>
    ) : null;
  }
  return (
    <Link
      className="inline-flex h-[18px] items-center rounded-sm font-mono text-[11.5px] text-blue-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300"
      params={{ databaseId, instanceId }}
      search={{
        category: "tables",
        name: target.table,
        schema: target.schema,
      }}
      to="/instances/$instanceId/databases/$databaseId/explorer"
    >
      {target.label}
      <span aria-hidden="true"> ↗</span>
    </Link>
  );
}

function ConstraintBadge({
  children,
  tone = "secondary",
}: {
  children: React.ReactNode;
  tone?: "ghost" | "outline" | "secondary" | "warning" | undefined;
}) {
  return (
    <Badge
      className={cn(
        "h-[18px] font-mono text-[10px]",
        tone === "ghost" && "border-transparent text-muted-foreground",
        tone === "warning" &&
          "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300"
      )}
      variant={tone === "outline" ? "outline" : "secondary"}
    >
      {children}
    </Badge>
  );
}

function ConstraintDefinitionCell({
  constraint,
}: {
  constraint: TableConstraint;
}) {
  const definition =
    constraint.definition ||
    `${CONSTRAINT_TYPE_LABELS[constraint.type]} (${formatConstraintColumns(constraint.columnNames)})`;
  return (
    <span className="block max-w-[36rem] truncate" title={definition}>
      {definition}
    </span>
  );
}

function orderConstraintsByKind(constraints: TableConstraint[]) {
  return [
    ...constraints.filter(isKeyConstraint),
    ...constraints.filter(isForeignKeyConstraint),
    ...constraints.filter(
      (constraint) => constraint.type === ConstraintType.CHECK
    ),
    ...constraints.filter(
      (constraint) =>
        !(
          isKeyConstraint(constraint) ||
          isForeignKeyConstraint(constraint) ||
          constraint.type === ConstraintType.CHECK
        )
    ),
  ];
}

function buildConstraintInventoryColumns({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}): DataTableColumnDef<TableConstraint>[] {
  return [
    {
      accessorFn: (row) => row.constraintName,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono font-semibold text-foreground text-xs">
            {row.original.constraintName || "—"}
          </span>
          {hasNotValidDefinition(row.original) ? (
            <Pill
              size="sm"
              title="Constraint was created NOT VALID and has not been validated yet"
              tone="amber"
            >
              Not valid
            </Pill>
          ) : null}
        </div>
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>Name</SortableHeader>
      ),
      id: "name",
    },
    {
      accessorFn: (row) => CONSTRAINT_TYPE_LABELS[row.type],
      cell: ({ row }) => (
        <ConstraintBadge>
          {CONSTRAINT_TYPE_LABELS[row.original.type]}
        </ConstraintBadge>
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>Kind</SortableHeader>
      ),
      id: "kind",
    },
    {
      accessorFn: (row) => row.definition,
      cell: ({ row }) => <ConstraintDefinitionCell constraint={row.original} />,
      header: "Definition",
      id: "definition",
      meta: {
        cellClassName: "font-mono text-muted-foreground text-xs",
      },
    },
    {
      cell: ({ row }) =>
        isForeignKeyConstraint(row.original) ? (
          <ReferencedTableTarget
            databaseId={databaseId}
            instanceId={instanceId}
            referencedTable={row.original.referencedTable}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      enableSorting: false,
      header: "References",
      id: "references",
      meta: {
        cellClassName: "font-mono text-xs",
      },
    },
  ];
}

function ConstraintsTab({
  databaseId,
  instanceId,
  query,
}: {
  databaseId: string;
  instanceId: string;
  query: ReturnType<typeof useListTableConstraintsQuery>;
}) {
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const toolbar = deriveMetadataToolbar([query]);
  if (query.error) {
    return (
      <TabError
        errors={[
          {
            endpoint: "ListTableConstraints",
            error: query.error,
            label: "Constraints",
          },
        ]}
        onRetry={toolbar.handleRetry}
        tab="constraints"
      />
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }
  const { constraints } = query.data;
  const kindFilterSet = new Set(kindFilters);
  const kindFilteredConstraints =
    kindFilterSet.size === 0
      ? constraints
      : constraints.filter((constraint) =>
          kindFilterSet.has(String(constraint.type))
        );
  return (
    <MetadataTabResult
      category="constraints"
      columns={buildConstraintInventoryColumns({ databaseId, instanceId })}
      data={orderConstraintsByKind(kindFilteredConstraints)}
      filterColumn="name"
      filterPlaceholder="Search constraints…"
      filters={
        <FacetFilterBar
          filters={[
            {
              handleSelectedValuesChange: setKindFilters,
              label: "Kind",
              options: presentConstraintKindOptions(constraints),
              selectedValues: kindFilters,
            },
          ]}
        />
      }
      hasUnfilteredData={constraints.length > 0}
      tableKey="data-explorer-table-constraints"
      toolbar={toolbar}
    />
  );
}

export { ConstraintsTab };
