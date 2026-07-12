"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Workflow as WorkflowIcon } from "lucide-react";
import {
  MetadataCard,
  PageHeader,
  ResourcePageState,
  SectionCard,
} from "@/components/console-pages/console-layout";
import {
  WorkflowPreconditionPanel,
  WorkflowStatusBadge,
} from "@/components/console-pages/database-workflows-page";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { CopyIconButton } from "@/components/ui/copy-icon-button";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import {
  useListAllWorkflowNodesQuery,
  useWorkflowQuery,
  workflowNodesQueryInput,
} from "@/hooks/api/workflow";
import {
  buildWorkflowName,
  formatTimestampLabel,
} from "@/lib/console-resources";
import { QUERY_STALE_TIME } from "@/lib/query-policy";
import { workflowPreconditionKind } from "@/lib/workflow-presentation";
import {
  type ListWorkflowNodesResponse,
  type WorkflowNode,
  WorkflowStatus,
} from "@/protogen/querylane/console/v1alpha1/workflow_pb";

const NODES_PAGE_SIZE = 50;

function DiagnosticCell({
  label,
  value,
}: {
  label: "query" | "result";
  value: string;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-96 items-center gap-1">
      <OverflowTooltip
        className="block min-w-0 flex-1 truncate rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        forceTooltip={true}
        tabIndex={0}
        tooltipContent={value}
      >
        {value}
      </OverflowTooltip>
      <CopyIconButton
        ariaLabel={`Copy ${label}`}
        className="size-11 shrink-0"
        size="icon"
        value={value}
      />
    </span>
  );
}

function nodeColumns(): DataTableColumnDef<WorkflowNode>[] {
  return [
    {
      accessorFn: (row) => row.nodeId,
      cell: ({ row }) => row.original.nodeId,
      header: () => "Node",
      id: "nodeId",
      meta: {
        cellClassName: "font-mono text-sm",
      },
    },
    {
      accessorFn: (row) => row.nodeType,
      cell: ({ row }) => row.original.nodeType || "—",
      header: () => "Type",
      id: "nodeType",
      meta: {
        cellClassName: "font-mono text-sm",
      },
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => row.original.status || "—",
      header: () => "Status",
      id: "status",
      meta: {
        cellClassName: "text-sm",
      },
    },
    {
      accessorFn: (row) => row.query,
      cell: ({ row }) =>
        row.original.query ? (
          <DiagnosticCell label="query" value={row.original.query} />
        ) : (
          "—"
        ),
      enableSorting: false,
      header: () => "Query",
      id: "query",
      meta: {
        cellClassName: "font-mono text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => row.resultName,
      cell: ({ row }) => row.original.resultName || "—",
      header: () => "Result name",
      id: "resultName",
      meta: {
        cellClassName: "font-mono text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => row.result,
      cell: ({ row }) =>
        row.original.result ? (
          <DiagnosticCell label="result" value={row.original.result} />
        ) : (
          "—"
        ),
      enableSorting: false,
      header: () => "Result",
      id: "result",
      meta: {
        cellClassName: "min-w-48 font-mono text-sm text-muted-foreground",
      },
    },
    {
      accessorFn: (row) => formatTimestampLabel(row.updateTime),
      cell: ({ row }) => formatTimestampLabel(row.original.updateTime),
      header: () => "Updated",
      id: "updated",
      meta: {
        cellClassName: "text-sm text-muted-foreground",
      },
    },
  ];
}

function WorkflowNotFoundState({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return (
    <EmptyState
      action={
        <AllWorkflowsLink databaseId={databaseId} instanceId={instanceId} />
      }
      description="This workflow instance does not exist, is not visible to the connection role, or was pruned by pg_durable's retention policy."
      icon={WorkflowIcon}
      title="Workflow not found"
    />
  );
}

function AllWorkflowsLink({
  databaseId,
  instanceId,
}: {
  databaseId: string;
  instanceId: string;
}) {
  return (
    <Link
      className="inline-flex items-center gap-1 text-muted-foreground text-sm underline-offset-4 hover:underline"
      params={{ databaseId, instanceId }}
      to="/instances/$instanceId/databases/$databaseId/workflows"
    >
      <ChevronLeft className="size-4" />
      All workflows
    </Link>
  );
}

// WorkflowStepsSection owns the graph query's loading/error/empty states so a
// failed ListWorkflowNodes shows an error with retry instead of silently
// rendering a valid workflow as having zero steps.
function WorkflowStepsSection({
  nodesQuery,
}: {
  nodesQuery: UseQueryResult<ListWorkflowNodesResponse>;
}) {
  let body: React.ReactNode;

  if (nodesQuery.isPending) {
    body = <p className="text-muted-foreground text-sm">Loading steps…</p>;
  } else if (nodesQuery.error) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-muted-foreground text-sm">
          Could not load the workflow steps.
        </p>
        <Button
          onClick={() => nodesQuery.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  } else {
    body = (
      <DataTable
        columns={nodeColumns()}
        data={nodesQuery.data.workflowNodes}
        emptyResourceName="workflow steps"
        initialSorting={[{ desc: false, id: "nodeId" }]}
        pageSize={NODES_PAGE_SIZE}
        tableKey="workflow-nodes"
      />
    );
  }

  return (
    <SectionCard
      description="One node per step of the workflow graph, with the status pg_durable reports for it."
      title="Steps"
    >
      {body}
    </SectionCard>
  );
}

function WorkflowDetailPage({
  databaseId,
  instanceId,
  workflowId,
}: {
  databaseId: string;
  instanceId: string;
  workflowId: string;
}) {
  const name = buildWorkflowName(instanceId, databaseId, workflowId);
  const workflowQuery = useWorkflowQuery(name, {
    enabled: Boolean(instanceId && databaseId && workflowId),
  });
  const nodesQuery = useListAllWorkflowNodesQuery(
    workflowNodesQueryInput({ databaseId, instanceId, workflowId }),
    {
      enabled: Boolean(instanceId && databaseId && workflowId),
      refetchInterval: ({ state }) => {
        const parentIsActive =
          workflowQuery.data?.status === WorkflowStatus.PENDING ||
          workflowQuery.data?.status === WorkflowStatus.RUNNING;
        const nodeIsActive = state.data?.workflowNodes.some(
          (node) => node.status === "pending" || node.status === "running"
        );

        return parentIsActive || nodeIsActive
          ? QUERY_STALE_TIME.workflowList
          : false;
      },
    }
  );
  const workflow = workflowQuery.data;

  // pg_durable preconditions can surface from either query; treat them the same
  // actionable way rather than as a transient error.
  const precondition = workflowPreconditionKind(
    workflowQuery.error ?? nodesQuery.error
  );

  if (precondition) {
    return (
      <div className="flex flex-col gap-6">
        <AllWorkflowsLink databaseId={databaseId} instanceId={instanceId} />
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
      area="console.database.workflow-detail"
      error={workflowQuery.error}
      hasData={workflow !== undefined}
      loading={workflowQuery.isPending}
      notFoundState={
        <WorkflowNotFoundState
          databaseId={databaseId}
          instanceId={instanceId}
        />
      }
      retry={workflowQuery.refetch}
      title="Loading workflow"
    >
      <div className="flex flex-col gap-6">
        <AllWorkflowsLink databaseId={databaseId} instanceId={instanceId} />
        <PageHeader
          description={workflow?.label || undefined}
          eyebrow="Workflow"
          title={workflow?.workflowId ?? workflowId}
        />
        {workflow ? (
          <MetadataCard
            items={[
              {
                label: "Status",
                value: <WorkflowStatusBadge status={workflow.status} />,
              },
              {
                label: "Function",
                value: workflow.functionName || "—",
              },
              {
                label: "Function version",
                value: workflow.functionVersion || "—",
              },
              // Executions is deliberately absent: pg_durable's
              // df.instance_info does not report execution_count (the list
              // surface does).
              {
                label: "Current execution",
                value: workflow.currentExecutionId || "—",
              },
            ]}
            title="Details"
          />
        ) : null}
        <WorkflowStepsSection nodesQuery={nodesQuery} />
        {workflow?.output ? (
          <SectionCard
            description="Final output recorded for this workflow instance."
            title="Output"
          >
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-sm">
              {workflow.output}
            </pre>
          </SectionCard>
        ) : null}
      </div>
    </ResourcePageState>
  );
}

export { WorkflowDetailPage };
