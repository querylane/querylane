import { createFileRoute } from "@tanstack/react-router";
import { BackendDatabaseQueryInsightsPage } from "@/components/console-pages/database-query-insights-page";
import {
  databaseRouteDataQueries,
  prefetchRouteData,
} from "@/lib/route-data-prefetch";

function DatabaseQueryInsightsRoute() {
  const { databaseId, instanceId } = Route.useParams();
  return (
    <BackendDatabaseQueryInsightsPage
      databaseId={databaseId}
      instanceId={instanceId}
    />
  );
}

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/insights"
)({
  component: DatabaseQueryInsightsRoute,
  loader: ({ context, params }) => {
    prefetchRouteData(
      context,
      databaseRouteDataQueries({
        databaseId: params.databaseId,
        instanceId: params.instanceId,
        transport: context.transport,
      })
    );
  },
});
