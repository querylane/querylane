"use client";

import { Link } from "@tanstack/react-router";
import {
  Info,
  Lock,
  PackageOpen,
  Workflow as WorkflowIcon,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  ResourcePageState,
} from "@/components/console-pages/console-layout";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
  SortableHeader,
} from "@/components/ui/data-table";
import {
  DataTableFacetedFilter,
  type FacetedFilterOption,
} from "@/components/ui/data-table-faceted-filter";
import {
  useListAllWorkflowsQuery,
  WORKFLOW_LIST_WINDOW,
  workflowsForDatabaseQueryInput,
} from "@/hooks/api/workflow";
import { useUrlTableSearch } from "@/lib/url-search-state";
import { cn } from "@/lib/utils";
import {
  type WorkflowPreconditionKind,
  workflowPreconditionKind,
  workflowStatusLabel,
  workflowStatusPresentation,
} from "@/lib/workflow-presentation";
import type {
  Workflow,
  WorkflowStatus,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";

const WORKFLOWS_PAGE_SIZE = 20;

function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const presentation = workflowStatusPresentation(status);

  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

function WorkflowsNotInstalledState({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return (
    <EmptyState
      action={
        <Link
          className={cn(buttonVariants({ variant: "outline" }))}
          params={{ databaseId, instanceId }}
          to="/instances/$instanceId/databases/$databaseId/extensions"
        >
          View extensions
        </Link>
      }
      description="Durable workflows need the pg_durable extension, which is not installed in this database. Installing it requires adding pg_durable to shared_preload_libraries and restarting PostgreSQL, so it cannot be enabled from here."
      icon={PackageOpen}
      title="pg_durable is not installed"
    />
  );
}

function WorkflowsAccessDeniedState() {
  return (
    <EmptyState
      description="pg_durable is installed, but the role Querylane connects with has not been granted access to it. An administrator can grant it by running df.grant_usage on this connection role. pg_durable grants nothing by default, so this step is required before workflows appear."
      icon={Lock}
      title="This role cannot see workflows"
    />
  );
}

// WorkflowPreconditionPanel renders the actionable panel for a pg_durable
// precondition (extension absent, or role not granted). Both the list and
// detail pages compute the kind via workflowPreconditionKind and render this.
function WorkflowPreconditionPanel({
  databaseId,
  instanceId,
  kind,
}: {
  databaseId: string;
  instanceId: string;
  kind: WorkflowPreconditionKind;
}) {
  if (kind === "not-installed") {
    return (
      <WorkflowsNotInstalledState
        databaseId={databaseId}
        instanceId={instanceId}
      />
    );
  }

  return <WorkflowsAccessDeniedState />;
}

// Best-effort truncation hint: pg_durable's df.list_instances is capped at its
// listing limit, so a full window means older instances may be hidden. This is
// a signal, not a guarantee (exactly-at-the-cap also trips it).
function WorkflowsTruncatedNote() {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm"
      role="status"
    >
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>
        Showing the newest {WORKFLOW_LIST_WINDOW} workflows. pg_durable caps its
        listing at this limit, so older instances may not appear.
      </span>
    </div>
  );
}

function workflowColumns({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}): DataTableColumnDef<Workflow>[] {
  return [
    {
      accessorFn: (row) => `${row.workflowId} ${row.label}`,
      cell: ({ row }) => (
        <Link
          className="font-mono text-sm underline-offset-4 hover:underline"
          params={{
            databaseId,
            instanceId,
            workflowId: row.original.workflowId,
          }}
          to="/instances/$instanceId/databases/$databaseId/workflows/$workflowId"
        >
          {row.original.workflowId}
        </Link>
      ),
      header: ({ column }) => (
        <SortableHeader column={column}>Workflow</SortableHeader>
      ),
      id: "workflow",
      // Hex ids sort surprisingly under the default alphanumeric heuristic
      // (leading digits parse as numbers), so force plain text ordering.
      sortFn: "text",
    },
    {
      accessorFn: (row) => workflowStatusLabel(row.status),
      cell: ({ row }) => <WorkflowStatusBadge status={row.original.status} />,
      header: ({ column }) => (
        <SortableHeader column={column}>Status</SortableHeader>
      ),
      id: "status",
    },
    {
      accessorFn: (row) => row.label,
      cell: ({ row }) => row.original.label || "—",
      header: ({ column }) => (
        <SortableHeader column={column}>Label</SortableHeader>
      ),
      id: "label",
      meta: {
        cellClassName: "text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => row.functionName,
      cell: ({ row }) => row.original.functionName || "—",
      header: ({ column }) => (
        <SortableHeader column={column}>Function</SortableHeader>
      ),
      id: "functionName",
      meta: {
        cellClassName: "font-mono text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => Number(row.executionCount),
      cell: ({ row }) => String(row.original.executionCount),
      header: ({ column }) => (
        <SortableHeader column={column}>Executions</SortableHeader>
      ),
      id: "executionCount",
      meta: {
        cellClassName: "text-sm text-muted-foreground tabular-nums",
      },
    },
  ];
}

function presentWorkflowStatusOptions(
  workflows: Workflow[]
): FacetedFilterOption[] {
  const labels = new Set(
    workflows.map((workflow) => workflowStatusLabel(workflow.status))
  );

  return [...labels]
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ label, value: label }));
}

function WorkflowsTable({
  databaseId,
  instanceId,
  workflows,
}: {
  databaseId: string;
  instanceId: string;
  workflows: Workflow[];
}) {
  const [filter, setFilter] = useUrlTableSearch();
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const filteredWorkflows =
    statusFilters.length === 0
      ? workflows
      : workflows.filter((workflow) =>
          statusFilters.includes(workflowStatusLabel(workflow.status))
        );
  const statusOptions = presentWorkflowStatusOptions(workflows);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex min-w-0 flex-wrap items-center justify-start gap-2"
        data-slot="workflow-filter-bar"
      >
        <DataTableFilter
          onChange={setFilter}
          placeholder="Search workflows..."
          value={filter}
        />
        {statusOptions.length > 0 ? (
          <DataTableFacetedFilter
            onSelectedValuesChange={setStatusFilters}
            options={statusOptions}
            selectedValues={statusFilters}
            title="Status"
          />
        ) : null}
        {statusFilters.length > 0 ? (
          <Button
            className="h-8 px-2 text-xs"
            onClick={() => setStatusFilters([])}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X data-icon="inline-start" />
            Reset
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={workflowColumns({ databaseId, instanceId })}
        data={filteredWorkflows}
        emptyResourceName="workflows"
        filterColumn="workflow"
        filterValue={filter}
        initialSorting={[{ desc: false, id: "workflow" }]}
        onFilterChange={setFilter}
        pageSize={WORKFLOWS_PAGE_SIZE}
        tableKey="database-workflows"
      />
    </div>
  );
}

function NoWorkflowsState() {
  return (
    <EmptyState
      description="No workflow instances are visible to the connection role. Start one with df.start(), and note that pg_durable only shows workflows submitted by the connecting role unless that role is a superuser."
      icon={WorkflowIcon}
      title="No workflows found"
    />
  );
}

function BackendDatabaseWorkflowsPage({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  const input = workflowsForDatabaseQueryInput({ databaseId, instanceId });
  const workflowsQuery = useListAllWorkflowsQuery(input, {
    enabled: Boolean(instanceId && databaseId),
    refetchOnWindowFocus: false,
  });
  const workflows = workflowsQuery.data?.workflows ?? [];
  const hasData = workflowsQuery.data !== undefined;
  const truncated = workflows.length >= WORKFLOW_LIST_WINDOW;

  // pg_durable "not usable" states (extension absent, or role not granted) are
  // preconditions, not transient errors, so they get their own actionable
  // panels instead of the retry-forever error card.
  const precondition = workflowPreconditionKind(workflowsQuery.error);

  if (precondition) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          description="Durable workflow instances reported by the pg_durable extension."
          eyebrow="Database"
          title="Workflows"
        />
        <WorkflowPreconditionPanel
          databaseId={databaseId}
          instanceId={instanceId}
          kind={precondition}
        />
      </div>
    );
  }

  return (
    <ResourcePageState
      area="console.database.workflows"
      error={workflowsQuery.error}
      hasData={hasData}
      loading={workflowsQuery.isPending}
      retry={workflowsQuery.refetch}
      title="Loading workflows"
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          description="Durable workflow instances reported by the pg_durable extension. Visibility follows the connection role: without superuser access, only workflows submitted by that role appear."
          eyebrow="Database"
          title="Workflows"
        />
        {workflows.length === 0 ? (
          <NoWorkflowsState />
        ) : (
          <div className="flex flex-col gap-3">
            {truncated ? <WorkflowsTruncatedNote /> : null}
            <WorkflowsTable
              databaseId={databaseId}
              instanceId={instanceId}
              workflows={workflows}
            />
          </div>
        )}
      </div>
    </ResourcePageState>
  );
}

export {
  BackendDatabaseWorkflowsPage,
  WorkflowPreconditionPanel,
  WorkflowStatusBadge,
};
