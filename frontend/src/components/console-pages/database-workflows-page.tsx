"use client";

import { Link } from "@tanstack/react-router";
import { Lock, PackageOpen, Workflow as WorkflowIcon, X } from "lucide-react";
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
} from "@/components/ui/data-table";
import {
  DataTableFacetedFilter,
  type FacetedFilterOption,
} from "@/components/ui/data-table-faceted-filter";
import {
  useListWorkflowsInfiniteQuery,
  workflowsForDatabaseQueryInput,
} from "@/hooks/api/workflow";
import { useUrlTableSearch } from "@/lib/url-search-state";
import { cn } from "@/lib/utils";
import {
  buildWorkflowListFilter,
  type WorkflowPreconditionKind,
  workflowPreconditionKind,
  workflowStatusLabel,
  workflowStatusPresentation,
} from "@/lib/workflow-presentation";
import {
  type Workflow,
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
      header: "Workflow",
      id: "workflow",
    },
    {
      accessorFn: (row) => workflowStatusLabel(row.status),
      cell: ({ row }) => <WorkflowStatusBadge status={row.original.status} />,
      header: "Status",
      id: "status",
    },
    {
      accessorFn: (row) => row.label,
      cell: ({ row }) => row.original.label || "—",
      header: "Label",
      id: "label",
      meta: {
        cellClassName: "text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => row.functionName,
      cell: ({ row }) => row.original.functionName || "—",
      header: "Function",
      id: "functionName",
      meta: {
        cellClassName: "font-mono text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => Number(row.executionCount),
      cell: ({ row }) => String(row.original.executionCount),
      header: "Executions",
      id: "executionCount",
      meta: {
        cellClassName: "text-sm text-muted-foreground tabular-nums",
      },
    },
  ];
}

const WORKFLOW_STATUS_OPTIONS: FacetedFilterOption[] = [
  WorkflowStatus.PENDING,
  WorkflowStatus.RUNNING,
  WorkflowStatus.COMPLETED,
  WorkflowStatus.FAILED,
  WorkflowStatus.CANCELLED,
].map((status) => ({
  label: workflowStatusLabel(status),
  value: String(status),
}));

function WorkflowsTable({
  databaseId,
  fetchNextPage,
  filter,
  hasNextPage,
  instanceId,
  isFetchingNextPage,
  setFilter,
  setStatusFilters,
  statusFilters,
  workflows,
}: {
  databaseId: string;
  fetchNextPage: () => Promise<unknown>;
  filter: string;
  hasNextPage: boolean;
  instanceId: string;
  isFetchingNextPage: boolean;
  setFilter: (value: string) => Promise<void>;
  setStatusFilters: (values: string[]) => void;
  statusFilters: string[];
  workflows: Workflow[];
}) {
  const visibleWorkflows = workflows.filter(
    (workflow) =>
      statusFilters.length === 0 ||
      statusFilters.includes(String(workflow.status))
  );

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
        <DataTableFacetedFilter
          onSelectedValuesChange={setStatusFilters}
          options={WORKFLOW_STATUS_OPTIONS}
          selectedValues={statusFilters}
          title="Status"
        />
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
        data={visibleWorkflows}
        emptyResourceName="workflows"
        pageSize={WORKFLOWS_PAGE_SIZE}
        tableKey="database-workflows"
      />
      {hasNextPage ? (
        <Button
          className="self-center"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
          type="button"
          variant="outline"
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
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
  const [filter, setFilter] = useUrlTableSearch();
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const statuses = statusFilters
    .map(Number)
    .filter((status): status is WorkflowStatus =>
      WORKFLOW_STATUS_OPTIONS.some((option) => option.value === String(status))
    );
  const serverFilter = buildWorkflowListFilter({ query: filter, statuses });
  const input = workflowsForDatabaseQueryInput({
    databaseId,
    filter: serverFilter,
    instanceId,
  });
  const workflowsQuery = useListWorkflowsInfiniteQuery(input, {
    enabled: Boolean(instanceId && databaseId),
  });
  const workflows =
    workflowsQuery.data?.pages.flatMap((page) => page.workflows) ?? [];
  const hasData = workflowsQuery.data !== undefined;
  const hasFilters = filter.trim() !== "" || statusFilters.length > 0;

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
        {workflows.length === 0 && !hasFilters ? (
          <NoWorkflowsState />
        ) : (
          <WorkflowsTable
            databaseId={databaseId}
            fetchNextPage={workflowsQuery.fetchNextPage}
            filter={filter}
            hasNextPage={workflowsQuery.hasNextPage}
            instanceId={instanceId}
            isFetchingNextPage={workflowsQuery.isFetchingNextPage}
            setFilter={setFilter}
            setStatusFilters={setStatusFilters}
            statusFilters={statusFilters}
            workflows={workflows}
          />
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
