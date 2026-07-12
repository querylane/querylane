"use client";

import { Workflow as WorkflowIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

function NoWorkflowsState() {
  return (
    <EmptyState
      description="No workflow instances are visible to the connection role. Start one with df.start(), and note that pg_durable only shows workflows submitted by the connecting role unless that role is a superuser."
      icon={WorkflowIcon}
      title="No workflows found"
    />
  );
}

export { NoWorkflowsState };
