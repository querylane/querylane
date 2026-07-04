import { useParams, useSearch } from "@tanstack/react-router";
import { RoleDetailPage } from "@/components/console-pages/role-detail-page";

export function RoleDetailRoute() {
  const { instanceId, roleId } = useParams({
    from: "/instances/$instanceId/roles/$roleId",
  });
  const { grantsReach, grantsSchema, grantsType, tab } = useSearch({
    from: "/instances/$instanceId/roles/$roleId",
  });
  return (
    <RoleDetailPage
      grantsReach={grantsReach}
      grantsSchema={grantsSchema}
      grantsType={grantsType}
      instanceId={instanceId}
      roleId={roleId}
      tab={tab}
    />
  );
}
