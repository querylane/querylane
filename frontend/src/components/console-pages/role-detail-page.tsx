"use client";

import { ResourcePageState } from "@/components/console-pages/console-layout";
import { RoleDetailContent } from "@/components/console-pages/role-detail-content";
import type {
  GrantsReach,
  GrantsType,
  RoleTab,
} from "@/components/console-pages/role-detail-search";
import { RoleNotFound } from "@/components/console-pages/role-detail-shared";
import {
  rolesForInstanceQueryInput,
  useListAllRolesQuery,
} from "@/hooks/api/role";
import { buildInverseMembershipIndex, roleIdOf } from "@/lib/role-display";

export function RoleDetailPage({
  grantsReach,
  grantsSchema,
  grantsType,
  instanceId,
  roleId,
  tab,
}: {
  grantsReach: GrantsReach | undefined;
  grantsSchema: string | undefined;
  grantsType: GrantsType | undefined;
  instanceId: string;
  roleId: string;
  tab: RoleTab | undefined;
}) {
  const rolesQuery = useListAllRolesQuery(
    rolesForInstanceQueryInput(instanceId)
  );
  const roles = rolesQuery.data?.roles ?? [];
  const role = roles.find((candidate) => roleIdOf(candidate) === roleId);
  const inverseIndex = buildInverseMembershipIndex(roles);
  const members = role ? (inverseIndex.get(role.roleName) ?? []) : [];

  return (
    <ResourcePageState
      area="console.roles"
      error={rolesQuery.error}
      hasData={Boolean(rolesQuery.data)}
      loading={rolesQuery.isPending}
      retry={rolesQuery.refetch}
      title="Loading role"
    >
      {role ? (
        <RoleDetailContent
          grantsReach={grantsReach}
          grantsSchema={grantsSchema}
          grantsType={grantsType}
          instanceId={instanceId}
          members={members}
          role={role}
          roleId={roleId}
          tab={tab}
        />
      ) : (
        <RoleNotFound instanceId={instanceId} />
      )}
    </ResourcePageState>
  );
}
