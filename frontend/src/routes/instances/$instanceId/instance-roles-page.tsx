import { useParams } from "@tanstack/react-router";
import { InstanceRolesPage } from "@/components/console-pages/instance-roles-page";

export function RolesRouteComponent() {
  const { instanceId } = useParams({ from: "/instances/$instanceId/roles" });
  return <InstanceRolesPage instanceId={instanceId} />;
}
