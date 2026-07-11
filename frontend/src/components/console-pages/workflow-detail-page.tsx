"use client";

import { Link } from "@tanstack/react-router";
import { ChevronLeft, Workflow as WorkflowIcon } from "lucide-react";
import {
  MetadataCard,
  PageHeader,
  ResourcePageState,
  SectionCard,
} from "@/components/console-pages/console-layout";
import {
  WorkflowStatusBadge,
  WorkflowsNotInstalledState,
} from "@/components/console-pages/database-workflows-page";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import {
  useListAllWorkflowNodesQuery,
  useWorkflowQuery,
  workflowNodesQueryInput,
} from "@/hooks/api/workflow";
import {
  buildWorkflowName,
  formatTimestampLabel,
} from "@/lib/console-resources";
import { isDurableNotInstalledError } from "@/lib/workflow-presentation";
import type { WorkflowNode } from "@/protogen/querylane/console/v1alpha1/workflow_pb";

const NODES_PAGE_SIZE = 50;

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
          <span className="block max-w-96 truncate" title={row.original.query}>
            {row.original.query}
          </span>
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
          <span className="block max-w-96 truncate" title={row.original.result}>
            {row.original.result}
          </span>
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
    { enabled: Boolean(instanceId && databaseId && workflowId) }
  );
  const workflow = workflowQuery.data;

  if (isDurableNotInstalledError(workflowQuery.error)) {
    return (
      <div className="flex flex-col gap-6">
        <AllWorkflowsLink databaseId={databaseId} instanceId={instanceId} />
        <WorkflowsNotInstalledState
          databaseId={databaseId}
          instanceId={instanceId}
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
              {
                label: "Executions",
                value: String(workflow.executionCount),
              },
              {
                label: "Current execution",
                value: workflow.currentExecutionId || "—",
              },
            ]}
            title="Details"
          />
        ) : null}
        <SectionCard
          description="One node per step of the workflow graph, with the status pg_durable reports for it."
          title="Steps"
        >
          <DataTable
            columns={nodeColumns()}
            data={nodesQuery.data?.workflowNodes ?? []}
            emptyResourceName="workflow steps"
            initialSorting={[{ desc: false, id: "nodeId" }]}
            pageSize={NODES_PAGE_SIZE}
            tableKey="workflow-nodes"
          />
        </SectionCard>
        {workflow?.output ? (
          <SectionCard
            description="Final output recorded for this workflow instance."
            title="Output"
          >
            <pre className="overflow-x-auto rounded-md bg-muted p-4 font-mono text-sm">
              {workflow.output}
            </pre>
          </SectionCard>
        ) : null}
      </div>
    </ResourcePageState>
  );
}

export { WorkflowDetailPage };
