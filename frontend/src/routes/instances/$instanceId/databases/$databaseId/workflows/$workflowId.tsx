import { createFileRoute } from "@tanstack/react-router";
import { WorkflowDetailPage } from "@/components/console-pages/workflow-detail-page";

function WorkflowDetailRoute() {
  const { databaseId, instanceId, workflowId } = Route.useParams();
  return (
    <WorkflowDetailPage
      databaseId={databaseId}
      instanceId={instanceId}
      workflowId={workflowId}
    />
  );
}

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/workflows/$workflowId"
)({
  component: WorkflowDetailRoute,
});
