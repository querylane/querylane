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
  AuditLogEntry_Action,
  AuditLogEntry_State,
} from "@/protogen/querylane/console/v1alpha1/admin_pb";

function auditStatus(entry: AuditLogEntry): {
  label: string;
  variant: "destructive" | "outline" | "secondary";
} {
  switch (entry.state) {
    case AuditLogEntry_State.RUNNING:
      return { label: "Running", variant: "outline" };
    case AuditLogEntry_State.SUCCEEDED:
      return { label: "Succeeded", variant: "secondary" };
    case AuditLogEntry_State.FAILED:
      return { label: "Failed", variant: "destructive" };
    case AuditLogEntry_State.UNSPECIFIED:
      return { label: "Unknown", variant: "outline" };
    default:
      return entry.state satisfies never;
  }
}

function actionLabel(action: AuditLogEntry_Action): string {
  switch (action) {
    case AuditLogEntry_Action.REFRESH_MATERIALIZED_VIEW:
      return "Refresh materialized view";
    case AuditLogEntry_Action.UNSPECIFIED:
      return "Mutation";
    default:
      return action satisfies never;
  }
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
    id: "state",
  },
  {
    accessorKey: "action",
    cell: ({ row }) => (
      <div className="w-56 space-y-1">
        <p className="font-medium">{actionLabel(row.original.action)}</p>
        <CompactValue
          className="font-mono text-muted-foreground text-xs"
          title={row.original.command}
        >
          {row.original.command}
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
      const scope = `${instanceId(row.original.instance)} / ${instanceId(row.original.database)}`;
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
    accessorKey: "startTime",
    cell: ({ row }) => formatTimestampLabel(row.original.startTime),
    header: "Started",
    id: "startTime",
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
