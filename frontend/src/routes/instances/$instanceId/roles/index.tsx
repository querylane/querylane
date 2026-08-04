import { createFileRoute } from "@tanstack/react-router";
import { InstanceRolesPage } from "@/components/console-pages/instance-roles-page";
import { instanceRolesSearchSchema } from "@/lib/instance-roles-search";

function RolesIndexRoute() {
  const { instanceId } = Route.useParams();
  const { tab, type } = Route.useSearch();
  return (
    <InstanceRolesPage
      instanceId={instanceId}
      searchRoute={Route.fullPath}
      tab={tab}
      type={type}
    />
  );
}

export const Route = createFileRoute("/instances/$instanceId/roles/")({
  component: RolesIndexRoute,
  validateSearch: instanceRolesSearchSchema,
});
