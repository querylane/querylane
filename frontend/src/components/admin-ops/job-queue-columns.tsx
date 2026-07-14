import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
  formatRelativeTimestamp,
  type JobExecutionStatus,
  shortReplicaId,
} from "@/lib/admin-ops";
import type { AdminRunnerExecution } from "@/protogen/querylane/console/v1alpha1/admin_pb";

// Placeholder shown for empty cells; held in a constant so the em-dash is a
// value rather than JSX prose (matches how the explorer tables render blanks).
const EMPTY_CELL = "—";

export function JobStatusCell({ status }: { status: JobExecutionStatus }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Spinner className="size-3.5" />
        {"Running"}
      </span>
    );
  }
  if (status === "error") {
    return <StatusIndicator label="Error" status="error" />;
  }
  if (status === "ok") {
    return <StatusIndicator label="OK" status="connected" />;
  }
  return <StatusIndicator label="Pending" status="disconnected" />;
}

export function LeaseCell({ execution }: { execution: AdminRunnerExecution }) {
  const owner = execution.leaseOwner;
  if (!(execution.leaseHeld && owner)) {
    return <span className="text-muted-foreground">{EMPTY_CELL}</span>;
  }
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm">
        {owner.hostname || "unknown host"}
      </span>
      <span className="font-mono text-muted-foreground text-xs">
        {shortReplicaId(owner.replicaId)}
        {" · expires"} {formatRelativeTimestamp(execution.leaseExpiresAt)}
      </span>
    </span>
  );
}

export function LastErrorCell({ lastError }: { lastError: string }) {
  if (!lastError) {
    return <span className="text-muted-foreground">{EMPTY_CELL}</span>;
  }
  return (
    <OverflowTooltip className="block max-w-72 truncate font-mono text-destructive text-xs">
      {lastError}
    </OverflowTooltip>
  );
}

export function RunnerNameCell({ runnerName }: { runnerName: string }) {
  return <span className="font-mono text-xs">{runnerName}</span>;
}

export function TargetCell({ target }: { target: string }) {
  return (
    <OverflowTooltip className="block max-w-64 truncate font-mono text-xs">
      {target}
    </OverflowTooltip>
  );
}
