"use client";

import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { GrantsSection } from "@/components/console-pages/role-grants-tab";
import { parseResourceLeafId } from "@/lib/console-resources";

function RoleGrantsTab({
  builtinInfo,
  databases,
  defaultPrivileges,
  defaultPrivilegesPartial,
  effectiveDb,
  effectiveDbId,
  facetStates,
  grantObjects,
  grantsPartial,
  grantsError,
  grantsPending,
  grantsView,
  instanceId,
  kind,
  onNavigateGrants,
  onSelectGrantsDatabase,
  ownedObjects,
  ownedPartial,
  publicGrants,
  publicGrantsPartial,
  role,
}: RoleDetailViewProps) {
  return (
    <GrantsSection
      builtinInfo={builtinInfo}
      databaseName={effectiveDb?.name}
      databases={databases}
      defaultPrivileges={defaultPrivileges}
      defaultPrivilegesPartial={defaultPrivilegesPartial}
      error={grantsError}
      facetStates={facetStates}
      grantsPartial={grantsPartial}
      grantsView={grantsView}
      isPending={grantsPending}
      kind={kind}
      objects={grantObjects}
      onNavigateGrants={onNavigateGrants}
      onSelectDatabase={onSelectGrantsDatabase}
      ownedObjects={ownedObjects}
      ownedPartial={ownedPartial}
      publicGrants={publicGrants}
      publicGrantsPartial={publicGrantsPartial}
      {...(effectiveDbId
        ? {
            queryScope: {
              databaseId: effectiveDbId,
              instanceId,
              roleId: parseResourceLeafId(role.name),
            },
          }
        : {})}
      roleName={role.roleName}
      selectedDatabaseId={effectiveDbId ?? undefined}
    />
  );
}

export { RoleGrantsTab };
