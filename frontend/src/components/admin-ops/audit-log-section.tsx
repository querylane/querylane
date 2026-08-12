import { AdminSectionError } from "@/components/admin-ops/admin-section-error";
import { AsyncSectionState } from "@/components/async-section-state";
import { SectionCard } from "@/components/console-pages/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DataTableColumnDef } from "@/components/ui/data-table";
import { DataTable } from "@/components/ui/data-table";
import { useAuditLogEntriesInfiniteQuery } from "@/hooks/api/admin";
import { formatTimestampLabel } from "@/lib/console-resources";
import { cn } from "@/lib/utils";
import {
  type AuditLogEntry,
  AuditLogEntry_Status,
} from "@/protogen/querylane/console/v1alpha1/admin_pb";

function auditStatus(entry: AuditLogEntry): {
  label: string;
  variant: "destructive" | "outline" | "secondary";
} {
  switch (entry.status) {
    case AuditLogEntry_Status.STARTED:
      return { label: "Started", variant: "outline" };
    case AuditLogEntry_Status.SUCCEEDED:
      return { label: "Succeeded", variant: "secondary" };
    case AuditLogEntry_Status.FAILED:
      return { label: "Failed", variant: "destructive" };
    case AuditLogEntry_Status.UNSPECIFIED:
      return { label: "Unknown", variant: "outline" };
    default:
      return entry.status satisfies never;
  }
}

function actionLabel(action: string): string {
  const spaced = action.replaceAll("_", " ");
  return spaced ? spaced[0]?.toUpperCase() + spaced.slice(1) : "Mutation";
}

function instanceId(resourceName: string): string {
  return resourceName.split("/").at(-1) || resourceName || "Not available";
}

function CompactValue({
  children,
  className,
  title,
}: {
  children: string;
  className: string;
  title: string;
}) {
  return (
    <span className={cn("block truncate", className)} title={title}>
      {children}
    </span>
  );
}

const AUDIT_COLUMNS: DataTableColumnDef<AuditLogEntry>[] = [
  {
    cell: ({ row }) => {
      const status = auditStatus(row.original);
      return <Badge variant={status.variant}>{status.label}</Badge>;
    },
    header: "Result",
    id: "status",
  },
  {
    accessorKey: "action",
    cell: ({ row }) => (
      <div className="w-56 space-y-1">
        <p className="font-medium">{actionLabel(row.original.action)}</p>
        <CompactValue
          className="font-mono text-muted-foreground text-xs"
          title={row.original.statement}
        >
          {row.original.statement}
        </CompactValue>
      </div>
    ),
    header: "Action",
    id: "action",
  },
  {
    accessorKey: "target",
    cell: ({ row }) => (
      <CompactValue
        className="w-40 font-mono text-xs"
        title={row.original.target}
      >
        {instanceId(row.original.target)}
      </CompactValue>
    ),
    header: "Target",
    id: "target",
  },
  {
    cell: ({ row }) => {
      const scope = `${instanceId(row.original.instance)} / ${row.original.database || "Not available"}`;
      return (
        <CompactValue className="w-36" title={scope}>
          {scope}
        </CompactValue>
      );
    },
    header: "Instance / database",
    id: "scope",
  },
  {
    accessorKey: "actor",
    cell: ({ row }) => (
      <CompactValue
        className="w-32 font-mono text-xs"
        title={row.original.actor}
      >
        {row.original.actor || "Not available"}
      </CompactValue>
    ),
    header: "Actor",
    id: "actor",
  },
  {
    accessorKey: "startedAt",
    cell: ({ row }) => formatTimestampLabel(row.original.startedAt),
    header: "Started",
    id: "startedAt",
  },
  {
    accessorKey: "resultSummary",
    cell: ({ row }) => (
      <CompactValue className="w-28" title={row.original.resultSummary}>
        {row.original.resultSummary || "Not available"}
      </CompactValue>
    ),
    header: "Details",
    id: "resultSummary",
  },
];

export function AuditLogSection() {
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    refetch,
  } = useAuditLogEntriesInfiniteQuery();
  const entries = data?.pages.flatMap((page) => page.auditLogEntries) ?? [];

  return (
    <SectionCard
      description="Server-recorded attempts to mutate managed PostgreSQL instances, including actor, target, outcome, and timing."
      title="Mutation audit log"
    >
      {error ? (
        <AdminSectionError
          area="admin-audit-log"
          error={error}
          onRetry={refetch}
        />
      ) : (
        <AsyncSectionState
          hasContent={data !== undefined}
          isPending={isPending}
          loadingMessage="Loading mutation audit log…"
        >
          <div className="space-y-3">
            <DataTable
              columns={AUDIT_COLUMNS}
              data={entries}
              emptyResourceName="mutation audit entries"
              tableKey="admin-audit-log"
            />
            {hasNextPage ? (
              <Button
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
                size="sm"
                variant="outline"
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            ) : null}
          </div>
        </AsyncSectionState>
      )}
    </SectionCard>
  );
}
