"use client";

import { WorkflowsAccessDeniedState } from "@/components/console-pages/workflows-access-denied-state";
import { WorkflowsNotInstalledState } from "@/components/console-pages/workflows-not-installed-state";
import type { WorkflowPreconditionKind } from "@/lib/workflow-presentation";

function WorkflowPreconditionPanel({
  databaseId,
  instanceId,
  kind,
}: {
  databaseId: string;
  instanceId: string;
  kind: WorkflowPreconditionKind;
}) {
  if (kind === "not-installed") {
    return (
      <WorkflowsNotInstalledState
        databaseId={databaseId}
        instanceId={instanceId}
      />
    );
  }

  return <WorkflowsAccessDeniedState />;
}

export { WorkflowPreconditionPanel };
