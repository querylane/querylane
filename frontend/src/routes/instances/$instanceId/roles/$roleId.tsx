import { createFileRoute } from "@tanstack/react-router";
import { roleDetailSearchSchema } from "@/components/console-pages/role-detail-search";
import { RoleDetailRoute } from "@/routes/instances/$instanceId/roles/role-detail-route";

export const Route = createFileRoute("/instances/$instanceId/roles/$roleId")({
  component: RoleDetailRoute,
  validateSearch: roleDetailSearchSchema,
});
