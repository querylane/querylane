import { createFileRoute } from "@tanstack/react-router";
import { dataExplorerSearchSchema } from "@/features/data-explorer/data-explorer-route-search";
import {
  explorerRouteDataQueries,
  prefetchRouteData,
} from "@/lib/route-data-prefetch";
import { DatabaseExplorerRoute } from "@/routes/instances/$instanceId/databases/$databaseId/database-explorer-page";
import { preloadSelectedTableDetail } from "@/routes/instances/$instanceId/databases/$databaseId/database-explorer-preload";

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/explorer"
)({
  component: DatabaseExplorerRoute,
  loader: ({ context, deps, params }) => {
    preloadSelectedTableDetail(deps);
    prefetchRouteData(
      context,
      explorerRouteDataQueries({
        databaseId: params.databaseId,
        instanceId: params.instanceId,
        search: deps,
        transport: context.transport,
      })
    );
  },
  loaderDeps: ({ search }) => ({
    category: search.category,
    name: search.name,
    schema: search.schema,
  }),
  validateSearch: dataExplorerSearchSchema,
});
