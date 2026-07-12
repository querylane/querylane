import { AdminSectionError } from "@/components/admin-ops/admin-section-error";
import { AsyncSectionState } from "@/components/async-section-state";
import { SectionCard } from "@/components/console-pages/console-layout";
import type { DataTableColumnDef } from "@/components/ui/data-table";
import { DataTable } from "@/components/ui/data-table";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { useListReplicasQuery } from "@/hooks/api/admin";
import { formatRelativeTimestamp } from "@/lib/admin-ops";
import { formatTimestampLabel } from "@/lib/console-resources";
import type { Replica } from "@/protogen/querylane/console/v1alpha1/admin_pb";

const REPLICA_COLUMNS: DataTableColumnDef<Replica>[] = [
  {
    accessorKey: "active",
    cell: ({ row }) => (
      <StatusIndicator
        label={row.original.active ? "Active" : "Stale"}
        status={row.original.active ? "connected" : "disconnected"}
      />
    ),
    header: "Status",
    id: "active",
  },
  {
    accessorKey: "hostname",
    cell: ({ row }) => row.original.hostname || "—",
    header: "Hostname",
    id: "hostname",
  },
  {
    accessorKey: "replicaId",
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.replicaId}</span>
    ),
    header: "Replica ID",
    id: "replicaId",
  },
  {
    accessorKey: "pid",
    cell: ({ row }) => row.original.pid.toString(),
    header: "PID",
    id: "pid",
  },
  {
    accessorKey: "startedAt",
    cell: ({ row }) => formatTimestampLabel(row.original.startedAt),
    header: "Started",
    id: "startedAt",
  },
  {
    accessorKey: "lastSeenAt",
    cell: ({ row }) => formatRelativeTimestamp(row.original.lastSeenAt),
    header: "Last seen",
    id: "lastSeenAt",
  },
];

export function ReplicasSection() {
  const { data, error, isPending, refetch } = useListReplicasQuery();
  const replicas = data?.replicas ?? [];

  return (
    <SectionCard
      description="Backend processes registered via heartbeat. Each replica competes for job leases; a stale replica stopped heartbeating and its rows age out."
      title="Replicas"
    >
      {error ? (
        <AdminSectionError
          area="admin-replicas"
          error={error}
          onRetry={refetch}
        />
      ) : (
        <AsyncSectionState
          hasContent={data !== undefined}
          isPending={isPending}
          loadingMessage="Loading replicas..."
        >
          <DataTable
            columns={REPLICA_COLUMNS}
            data={replicas}
            emptyResourceName="replicas"
            tableKey="admin-replicas"
          />
        </AsyncSectionState>
      )}
    </SectionCard>
  );
}
