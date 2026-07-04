import { createFileRoute, Outlet } from "@tanstack/react-router";

function DatabasesLayoutRoute() {
  return <Outlet />;
}

export const Route = createFileRoute("/instances/$instanceId/databases")({
  component: DatabasesLayoutRoute,
});
