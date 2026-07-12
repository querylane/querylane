import { AdminSectionError } from "@/components/admin-ops/admin-section-error";
import { AsyncSectionState } from "@/components/async-section-state";
import { SectionCard } from "@/components/console-pages/console-layout";
import type { DataTableColumnDef } from "@/components/ui/data-table";
import { DataTable } from "@/components/ui/data-table";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { useListCatalogSyncStatesQuery } from "@/hooks/api/admin";
import { formatRelativeTimestamp } from "@/lib/admin-ops";
import type { CatalogSyncState } from "@/protogen/querylane/console/v1alpha1/admin_pb";
import { CatalogSyncStatus } from "@/protogen/querylane/console/v1alpha1/catalog_sync_pb";

// Placeholder shown for empty cells; held in a constant so the em-dash is a
// value rather than JSX prose (matches how the explorer tables render blanks).
const EMPTY_CELL = "—";

function SyncStatusCell({ status }: { status: CatalogSyncStatus }) {
  switch (status) {
    case CatalogSyncStatus.SYNCED:
      return <StatusIndicator label="Synced" status="connected" />;
    case CatalogSyncStatus.SYNCING:
      return (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Spinner className="size-3.5" />
          Syncing
        </span>
      );
    case CatalogSyncStatus.ERROR:
      return <StatusIndicator label="Error" status="error" />;
    case CatalogSyncStatus.NEVER_SYNCED:
      return <StatusIndicator label="Never synced" status="disconnected" />;
    default:
      return <StatusIndicator label="Unknown" status="disconnected" />;
  }
}

const CATALOG_SYNC_COLUMNS: DataTableColumnDef<CatalogSyncState>[] = [
  {
    accessorKey: "scope",
    cell: ({ row }) => (
      <OverflowTooltip className="block max-w-80 truncate font-mono text-xs">
        {row.original.scope}
      </OverflowTooltip>
    ),
    header: "Scope",
    id: "scope",
  },
  {
    accessorKey: "status",
    cell: ({ row }) => <SyncStatusCell status={row.original.status} />,
    header: "Status",
    id: "status",
  },
  {
    accessorKey: "lastSyncedAt",
    cell: ({ row }) => formatRelativeTimestamp(row.original.lastSyncedAt),
    header: "Last synced",
    id: "lastSyncedAt",
  },
  {
    accessorKey: "updatedAt",
    cell: ({ row }) => formatRelativeTimestamp(row.original.updatedAt),
    header: "Updated",
    id: "updatedAt",
  },
  {
    accessorKey: "syncError",
    cell: ({ row }) =>
      row.original.syncError ? (
        <OverflowTooltip className="block max-w-72 truncate font-mono text-destructive text-xs">
          {row.original.syncError}
        </OverflowTooltip>
      ) : (
        <span className="text-muted-foreground">{EMPTY_CELL}</span>
      ),
    header: "Error",
    id: "syncError",
  },
];

export function CatalogSyncSection() {
  const { data, error, isPending, refetch } = useListCatalogSyncStatesQuery();
  const states = data?.catalogSyncStates ?? [];

  return (
    <SectionCard
      description="Raw catalog sync bookkeeping per cached scope, with unmasked errors. The user-facing console shows a sanitized version of these failures."
      title="Catalog sync"
    >
      {error ? (
        <AdminSectionError
          area="admin-catalog-sync"
          error={error}
          onRetry={refetch}
        />
      ) : (
        <AsyncSectionState
          hasContent={data !== undefined}
          isPending={isPending}
          loadingMessage="Loading catalog sync state..."
        >
          <DataTable
            columns={CATALOG_SYNC_COLUMNS}
            data={states}
            emptyResourceName="catalog sync scopes"
            filterColumn="scope"
            filterPlaceholder="Filter scopes..."
            tableKey="admin-catalog-sync"
          />
        </AsyncSectionState>
      )}
    </SectionCard>
  );
}
