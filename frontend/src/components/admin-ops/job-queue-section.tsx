import { useState } from "react";
import { AdminSectionError } from "@/components/admin-ops/admin-section-error";
import {
  JobStatusCell,
  LastErrorCell,
  LeaseCell,
  RunnerNameCell,
  TargetCell,
} from "@/components/admin-ops/job-queue-columns";
import { AsyncSectionState } from "@/components/async-section-state";
import { SectionCard } from "@/components/console-pages/console-layout";
import { Button } from "@/components/ui/button";
import type { DataTableColumnDef } from "@/components/ui/data-table";
import { DataTable } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  JOB_QUEUE_PAGE_SIZE,
  useAdminRunnerExecutionsInfiniteQuery,
} from "@/hooks/api/admin";
import {
  ALL_RUNNERS_FILTER_VALUE,
  buildRunnerFilter,
  deriveJobExecutionStatus,
  formatRelativeTimestamp,
  KNOWN_RUNNER_NAMES,
} from "@/lib/admin-ops";
import type { AdminRunnerExecution } from "@/protogen/querylane/console/v1alpha1/admin_pb";

/**
 * The client DataTable pages at the server fetch size (JOB_QUEUE_PAGE_SIZE) so
 * it never paginates below a fetched server page — one "page" per Load more.
 */
const JOB_QUEUE_TABLE_PAGE_SIZE = JOB_QUEUE_PAGE_SIZE;

const JOB_QUEUE_COLUMNS: DataTableColumnDef<AdminRunnerExecution>[] = [
  {
    cell: ({ row }) => (
      <JobStatusCell status={deriveJobExecutionStatus(row.original)} />
    ),
    header: "Status",
    id: "status",
  },
  {
    accessorKey: "runnerName",
    cell: ({ row }) => <RunnerNameCell runnerName={row.original.runnerName} />,
    header: "Runner",
    id: "runnerName",
  },
  {
    accessorKey: "target",
    cell: ({ row }) => <TargetCell target={row.original.target} />,
    header: "Target",
    id: "target",
  },
  {
    cell: ({ row }) => <LeaseCell execution={row.original} />,
    header: "Lease",
    id: "lease",
  },
  {
    accessorKey: "lastSuccessAt",
    cell: ({ row }) => formatRelativeTimestamp(row.original.lastSuccessAt),
    header: "Last success",
    id: "lastSuccessAt",
  },
  {
    accessorKey: "lastFinishedAt",
    cell: ({ row }) => formatRelativeTimestamp(row.original.lastFinishedAt),
    header: "Last finished",
    id: "lastFinishedAt",
  },
  {
    accessorKey: "lastError",
    cell: ({ row }) => <LastErrorCell lastError={row.original.lastError} />,
    header: "Last error",
    id: "lastError",
  },
];

function RunnerFilterSelect({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Select
      onValueChange={(next) => {
        if (next) {
          onChange(next);
        }
      }}
      value={value}
    >
      <SelectTrigger aria-label="Filter by runner" className="h-8 w-56">
        <SelectValue>
          {value === ALL_RUNNERS_FILTER_VALUE ? "All runners" : value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_RUNNERS_FILTER_VALUE}>All runners</SelectItem>
        {KNOWN_RUNNER_NAMES.map((runnerName) => (
          <SelectItem key={runnerName} value={runnerName}>
            {runnerName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function JobQueueSection() {
  const [selectedRunner, setSelectedRunner] = useState<string>(
    ALL_RUNNERS_FILTER_VALUE
  );
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    refetch,
  } = useAdminRunnerExecutionsInfiniteQuery(buildRunnerFilter(selectedRunner));

  const executions = data?.pages.flatMap((page) => page.runnerExecutions) ?? [];

  return (
    <SectionCard
      description="The distributed job queue behind metrics collection: one row per runner and target, with lease ownership from the fleet's shared bookkeeping. Start here when metrics are missing."
      title="Job queue"
    >
      {error ? (
        <AdminSectionError
          area="admin-job-queue"
          error={error}
          onRetry={refetch}
        />
      ) : (
        <AsyncSectionState
          hasContent={data !== undefined}
          isPending={isPending}
          loadingMessage="Loading job queue..."
        >
          <div className="space-y-3">
            <DataTable
              columns={JOB_QUEUE_COLUMNS}
              data={executions}
              emptyResourceName="runner executions"
              pageSize={JOB_QUEUE_TABLE_PAGE_SIZE}
              tableKey="admin-job-queue"
              toolbarFilters={
                <RunnerFilterSelect
                  onChange={setSelectedRunner}
                  value={selectedRunner}
                />
              }
            />
            {hasNextPage ? (
              <Button
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
                size="sm"
                variant="outline"
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </Button>
            ) : null}
          </div>
        </AsyncSectionState>
      )}
    </SectionCard>
  );
}
