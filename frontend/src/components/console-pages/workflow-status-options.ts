import type { FacetedFilterOption } from "@/components/ui/data-table-faceted-filter";
import { workflowStatusLabel } from "@/lib/workflow-presentation";
import { WorkflowStatus } from "@/protogen/querylane/console/v1alpha1/workflow_pb";

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

export { WORKFLOW_STATUS_OPTIONS };
