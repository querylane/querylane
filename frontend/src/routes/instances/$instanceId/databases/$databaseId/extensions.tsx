import { createFileRoute } from "@tanstack/react-router";
import { BackendDatabaseExtensionsPage } from "@/components/console-pages/database-extensions-page";

function DatabaseExtensionsPage() {
  const { databaseId, instanceId } = Route.useParams();
  return (
    <BackendDatabaseExtensionsPage
      databaseId={databaseId}
      instanceId={instanceId}
      searchRoute={Route.fullPath}
    />
  );
}

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/extensions"
)({
  component: DatabaseExtensionsPage,
  loader: async ({ context, params }) => {
    const { extensionRouteDataQueries, prefetchRouteData } = await import(
      "@/lib/route-data-prefetch"
    );
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
