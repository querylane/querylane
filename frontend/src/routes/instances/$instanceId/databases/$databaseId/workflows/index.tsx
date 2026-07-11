import { createFileRoute } from "@tanstack/react-router";
import { BackendDatabaseWorkflowsPage } from "@/components/console-pages/database-workflows-page";
import { RouteErrorView } from "@/components/route-error-view";
import {
  prefetchRouteData,
  workflowRouteDataQueries,
} from "@/lib/route-data-prefetch";

function DatabaseWorkflowsPage() {
  const { databaseId, instanceId } = Route.useParams();
  return (
    <BackendDatabaseWorkflowsPage
      databaseId={databaseId}
      instanceId={instanceId}
    />
  );
}

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/workflows/"
)({
  component: DatabaseWorkflowsPage,
  errorComponent: ({ error, reset }) => (
    <RouteErrorView
      containerClassName="min-h-[60vh]"
      error={error}
      reset={reset}
    />
  ),
  loader: ({ context, params }) => {
    prefetchRouteData(
      context,
      workflowRouteDataQueries({
        databaseId: params.databaseId,
        instanceId: params.instanceId,
        transport: context.transport,
      })
    );
  },
});
