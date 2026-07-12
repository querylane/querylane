"use client";

import { Lock } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

function WorkflowsAccessDeniedState() {
  return (
    <EmptyState
      description="pg_durable is installed, but the role Querylane connects with has not been granted access to it. An administrator can grant it by running df.grant_usage on this connection role. pg_durable grants nothing by default, so this step is required before workflows appear."
      icon={Lock}
      title="This role cannot see workflows"
    />
  );
}

export { WorkflowsAccessDeniedState };
