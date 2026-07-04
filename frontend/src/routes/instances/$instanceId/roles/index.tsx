import { createFileRoute } from "@tanstack/react-router";
import { InstanceRolesPage } from "@/components/console-pages/instance-roles-page";
import { instanceRolesSearchSchema } from "@/components/console-pages/instance-roles-search";

function RolesIndexRoute() {
  const { instanceId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <InstanceRolesPage instanceId={instanceId} tab={tab} />;
}

export const Route = createFileRoute("/instances/$instanceId/roles/")({
  component: RolesIndexRoute,
  validateSearch: instanceRolesSearchSchema,
});
