"use client";

import { Badge } from "@/components/ui/badge";
import { workflowStatusPresentation } from "@/lib/workflow-presentation";
import type { WorkflowStatus } from "@/protogen/querylane/console/v1alpha1/workflow_pb";

function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const presentation = workflowStatusPresentation(status);

  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

export { WorkflowStatusBadge };
