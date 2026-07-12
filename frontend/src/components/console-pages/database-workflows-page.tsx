"use client";

import { useState } from "react";
import {
  PageHeader,
  ResourcePageState,
} from "@/components/console-pages/console-layout";
import { NoWorkflowsState } from "@/components/console-pages/no-workflows-state";
import { WorkflowPreconditionPanel } from "@/components/console-pages/workflow-precondition-panel";
import { WORKFLOW_STATUS_OPTIONS } from "@/components/console-pages/workflow-status-options";
import { WorkflowsTable } from "@/components/console-pages/workflows-table";
import {
  useListWorkflowsInfiniteQuery,
  workflowsForDatabaseQueryInput,
} from "@/hooks/api/workflow";
import { useUrlTableSearch } from "@/lib/url-search-state";
import {
  buildWorkflowListFilter,
  workflowPreconditionKind,
} from "@/lib/workflow-presentation";
import type { WorkflowStatus } from "@/protogen/querylane/console/v1alpha1/workflow_pb";

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

export { BackendDatabaseWorkflowsPage };
