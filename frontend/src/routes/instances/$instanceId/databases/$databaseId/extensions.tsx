import { createFileRoute } from "@tanstack/react-router";
import { BackendDatabaseExtensionsPage } from "@/components/console-pages/database-extensions-page";
import {
  extensionRouteDataQueries,
  prefetchRouteData,
} from "@/lib/route-data-prefetch";

function DatabaseExtensionsPage() {
  const { databaseId, instanceId } = Route.useParams();
  return (
    <BackendDatabaseExtensionsPage
      databaseId={databaseId}
      instanceId={instanceId}
    />
  );
}

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/extensions"
)({
  component: DatabaseExtensionsPage,
  loader: ({ context, params }) => {
    prefetchRouteData(
      context,
      extensionRouteDataQueries({
        databaseId: params.databaseId,
        instanceId: params.instanceId,
        transport: context.transport,
      })
    );
  },
});
