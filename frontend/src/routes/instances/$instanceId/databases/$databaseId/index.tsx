import { createFileRoute } from "@tanstack/react-router";
import { BackendDatabasePage } from "@/components/console-pages/database-page";
import {
  databaseRouteDataQueries,
  prefetchRouteData,
} from "@/lib/route-data-prefetch";

function DatabasePage() {
  const { databaseId, instanceId } = Route.useParams();
  return (
    <BackendDatabasePage
      databaseId={databaseId}
      instanceId={instanceId}
      section="overview"
    />
  );
}

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/"
)({
  component: DatabasePage,
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
