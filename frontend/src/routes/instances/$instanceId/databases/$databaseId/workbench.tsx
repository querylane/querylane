import { createFileRoute } from "@tanstack/react-router";
import { SqlWorkbenchPage } from "@/features/sql-workbench/sql-workbench-page";
import {
  databaseRouteDataQueries,
  prefetchRouteData,
} from "@/lib/route-data-prefetch";

function SqlWorkbenchRoute() {
  const { databaseId, instanceId } = Route.useParams();
  return <SqlWorkbenchPage databaseId={databaseId} instanceId={instanceId} />;
}

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/workbench"
)({
  component: SqlWorkbenchRoute,
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
