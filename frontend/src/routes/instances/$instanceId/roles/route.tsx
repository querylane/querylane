import { createFileRoute, Outlet } from "@tanstack/react-router";

function RolesLayoutRoute() {
  return <Outlet />;
}

export const Route = createFileRoute("/instances/$instanceId/roles")({
  component: RolesLayoutRoute,
});
