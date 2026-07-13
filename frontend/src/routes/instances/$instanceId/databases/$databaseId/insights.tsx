import { createFileRoute } from "@tanstack/react-router";
import { BackendDatabaseQueryInsightsPage } from "@/components/console-pages/database-query-insights-page";
import {
  prefetchRouteData,
  queryInsightsRouteDataQueries,
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
      queryInsightsRouteDataQueries({
        databaseId: params.databaseId,
        instanceId: params.instanceId,
        transport: context.transport,
      })
    );
  },
});
