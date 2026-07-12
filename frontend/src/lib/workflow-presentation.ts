import { Code, ConnectError } from "@connectrpc/connect";
import type { badgeVariants } from "@/components/ui/badge";
import { ErrorInfoSchema } from "@/protogen/google/rpc/error_details_pb";
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

const WORKFLOW_STATUS_FILTER_VALUE: Partial<Record<WorkflowStatus, string>> = {
  [WorkflowStatus.PENDING]: "pending",
  [WorkflowStatus.RUNNING]: "running",
  [WorkflowStatus.COMPLETED]: "completed",
  [WorkflowStatus.FAILED]: "failed",
  [WorkflowStatus.CANCELLED]: "cancelled",
};

function escapeWorkflowFilterString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function buildWorkflowListFilter({
  query,
  statuses,
}: {
  query: string;
  statuses: WorkflowStatus[];
}): string {
  const filters: string[] = [];
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    const value = escapeWorkflowFilterString(trimmedQuery);
    filters.push(`(name:"${value}" OR label:"${value}")`);
  }

  const statusFilters = statuses.flatMap((status) => {
    const value = WORKFLOW_STATUS_FILTER_VALUE[status];
    return value ? [`status = "${value}"`] : [];
  });
  if (statusFilters.length > 0) {
    filters.push(`(${statusFilters.join(" OR ")})`);
  }

  return filters.join(" AND ");
}

function isDurableNotInstalledError(error: unknown): boolean {
  if (
    !(error instanceof ConnectError) ||
    error.code !== Code.FailedPrecondition
  ) {
    return false;
  }

  return error
    .findDetails(ErrorInfoSchema)
    .some((detail) => detail.metadata["pg_durable_state"] === "not_installed");
}

function isDurableAccessDeniedError(error: unknown): boolean {
  if (
    !(error instanceof ConnectError) ||
    error.code !== Code.PermissionDenied
  ) {
    return false;
  }

  return error
    .findDetails(ErrorInfoSchema)
    .some((detail) => detail.metadata["pg_durable_state"] === "access_denied");
}

type WorkflowPreconditionKind = "not-installed" | "access-denied";

/**
 * Classify a WorkflowService error as a pg_durable precondition (something the
 * operator must fix once), or null for a normal/transient error. Lets the
 * pages render an actionable panel instead of a retry-forever error card.
 */
function workflowPreconditionKind(
  error: unknown
): WorkflowPreconditionKind | null {
  if (isDurableNotInstalledError(error)) {
    return "not-installed";
  }

  if (isDurableAccessDeniedError(error)) {
    return "access-denied";
  }

  return null;
}

export {
  buildWorkflowListFilter,
  isDurableAccessDeniedError,
  isDurableNotInstalledError,
  type WorkflowPreconditionKind,
  workflowPreconditionKind,
  workflowStatusLabel,
  workflowStatusPresentation,
};
