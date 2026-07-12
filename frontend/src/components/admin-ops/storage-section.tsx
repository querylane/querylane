import { AdminSectionError } from "@/components/admin-ops/admin-section-error";
import { AsyncSectionState } from "@/components/async-section-state";
import {
  SectionCard,
  SummaryCard,
} from "@/components/console-pages/console-layout";
import type { DataTableColumnDef } from "@/components/ui/data-table";
import { DataTable } from "@/components/ui/data-table";
import { useGetMetricsStorageStatsQuery } from "@/hooks/api/admin";
import { formatRelativeTimestamp } from "@/lib/admin-ops";
import { formatBytes } from "@/lib/console-resources";
import type {
  GetMetricsStorageStatsResponse,
  SampleTableStats,
} from "@/protogen/querylane/console/v1alpha1/admin_pb";

const rowCountFormatter = new Intl.NumberFormat("en-US");
const SECONDS_PER_DAY = 86_400n;

function formatEstimatedRows(estimatedRowCount: bigint): string {
  if (estimatedRowCount < 0n) {
    return "not analyzed yet";
  }
  return `~${rowCountFormatter.format(Number(estimatedRowCount))}`;
}

function formatRetention(
  retention: GetMetricsStorageStatsResponse["retentionPeriod"]
): string {
  if (!retention) {
    return "—";
  }
  const days = retention.seconds / SECONDS_PER_DAY;
  if (days > 0n) {
    return `${days} days`;
  }
  return `${retention.seconds} seconds`;
}

const STORAGE_COLUMNS: DataTableColumnDef<SampleTableStats>[] = [
  {
    accessorKey: "tableName",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.tableName}</span>
    ),
    header: "Table",
    id: "tableName",
  },
  {
    accessorKey: "estimatedRowCount",
    cell: ({ row }) => formatEstimatedRows(row.original.estimatedRowCount),
    header: "Est. rows",
    id: "estimatedRowCount",
  },
  {
    accessorKey: "totalBytes",
    cell: ({ row }) => formatBytes(row.original.totalBytes),
    header: "Size",
    id: "totalBytes",
  },
  {
    accessorKey: "oldestSampleAt",
    cell: ({ row }) => formatRelativeTimestamp(row.original.oldestSampleAt),
    header: "Oldest sample",
    id: "oldestSampleAt",
  },
  {
    accessorKey: "newestSampleAt",
    cell: ({ row }) => formatRelativeTimestamp(row.original.newestSampleAt),
    header: "Newest sample",
    id: "newestSampleAt",
  },
];

export function StorageSection() {
  const { data, error, isPending, refetch } = useGetMetricsStorageStatsQuery();
  const tables = data?.sampleTables ?? [];
  const totalBytes = tables.reduce((sum, table) => sum + table.totalBytes, 0n);

  return (
    <SectionCard
      description="On-disk footprint of the metrics sample tables in querylane's own database. Rows older than the retention period are pruned by the sample_retention runner."
      title="Metrics storage"
    >
      {error ? (
        <AdminSectionError
          area="admin-storage"
          error={error}
          onRetry={refetch}
        />
      ) : (
        <AsyncSectionState
          hasContent={data !== undefined}
          isPending={isPending}
          loadingMessage="Loading storage stats..."
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Total size" value={formatBytes(totalBytes)} />
              <SummaryCard
                label="Sample tables"
                value={tables.length.toString()}
              />
              <SummaryCard
                label="Retention"
                value={formatRetention(data?.retentionPeriod)}
              />
            </div>
            <DataTable
              columns={STORAGE_COLUMNS}
              data={tables}
              emptyResourceName="sample tables"
              tableKey="admin-storage"
            />
          </div>
        </AsyncSectionState>
      )}
    </SectionCard>
  );
}
