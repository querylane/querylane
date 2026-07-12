"use client";

import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { WorkflowStatusBadge } from "@/components/console-pages/workflow-status-badge";
import { WORKFLOW_STATUS_OPTIONS } from "@/components/console-pages/workflow-status-options";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
} from "@/components/ui/data-table";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import { workflowStatusLabel } from "@/lib/workflow-presentation";
import type { Workflow } from "@/protogen/querylane/console/v1alpha1/workflow_pb";

const WORKFLOWS_PAGE_SIZE = 20;

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
      meta: { cellClassName: "text-sm text-muted-foreground" },
    },
    {
      accessorFn: (row) => row.functionName,
      cell: ({ row }) => row.original.functionName || "—",
      header: "Function",
      id: "functionName",
      meta: { cellClassName: "font-mono text-sm text-muted-foreground" },
    },
    {
      accessorFn: (row) => Number(row.executionCount),
      cell: ({ row }) => String(row.original.executionCount),
      header: "Executions",
      id: "executionCount",
      meta: { cellClassName: "text-sm text-muted-foreground tabular-nums" },
    },
  ];
}

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

export { WorkflowsTable };
