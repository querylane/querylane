import { createFileRoute } from "@tanstack/react-router";
import { SqlWorkbenchPage } from "@/features/sql-workbench/sql-workbench-page";

function DatabaseSqlWorkbenchRoute() {
  const { databaseId, instanceId } = Route.useParams();
  return <SqlWorkbenchPage databaseId={databaseId} instanceId={instanceId} />;
}

export const Route = createFileRoute(
  "/instances/$instanceId/databases/$databaseId/sql"
)({
  component: DatabaseSqlWorkbenchRoute,
});
