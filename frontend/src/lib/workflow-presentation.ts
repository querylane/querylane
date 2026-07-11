import { Code, ConnectError } from "@connectrpc/connect";
import type { badgeVariants } from "@/components/ui/badge";
import { WorkflowStatus } from "@/protogen/querylane/console/v1alpha1/workflow_pb";

type BadgeVariant = NonNullable<Parameters<typeof badgeVariants>[0]>["variant"];

const WORKFLOW_STATUS_PRESENTATION: Record<
  WorkflowStatus,
  { label: string; variant: BadgeVariant }
> = {
  [WorkflowStatus.UNSPECIFIED]: { label: "Unknown", variant: "outline" },
  [WorkflowStatus.PENDING]: { label: "Pending", variant: "outline" },
  [WorkflowStatus.RUNNING]: { label: "Running", variant: "default" },
  [WorkflowStatus.COMPLETED]: { label: "Completed", variant: "secondary" },
  [WorkflowStatus.FAILED]: { label: "Failed", variant: "destructive" },
  [WorkflowStatus.CANCELLED]: { label: "Cancelled", variant: "outline" },
};

function workflowStatusPresentation(status: WorkflowStatus): {
  label: string;
  variant: BadgeVariant;
} {
  return (
    WORKFLOW_STATUS_PRESENTATION[status] ??
    WORKFLOW_STATUS_PRESENTATION[WorkflowStatus.UNSPECIFIED]
  );
}

function workflowStatusLabel(status: WorkflowStatus): string {
  return workflowStatusPresentation(status).label;
}

/**
 * WorkflowService RPCs fail with FailedPrecondition exactly when the
 * pg_durable extension is absent from the target database.
 */
function isDurableNotInstalledError(error: unknown): boolean {
  return (
    error instanceof ConnectError && error.code === Code.FailedPrecondition
  );
}

export {
  isDurableNotInstalledError,
  workflowStatusLabel,
  workflowStatusPresentation,
};
