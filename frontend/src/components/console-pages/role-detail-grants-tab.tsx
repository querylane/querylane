"use client";

import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { GrantsSection } from "@/components/console-pages/role-grants-tab";

function RoleGrantsTab({
  builtinInfo,
  databases,
  defaultPrivileges,
  effectiveDb,
  effectiveDbId,
  facetStates,
  grantObjects,
  grantsError,
  grantsPending,
  grantsView,
  kind,
  onNavigateGrants,
  onSelectGrantsDatabase,
  ownedObjects,
  publicGrants,
  role,
}: RoleDetailViewProps) {
  return (
    <GrantsSection
      builtinInfo={builtinInfo}
      databaseName={effectiveDb?.name}
      databases={databases}
      defaultPrivileges={defaultPrivileges}
      error={grantsError}
      facetStates={facetStates}
      grantsView={grantsView}
      isPending={grantsPending}
      kind={kind}
      objects={grantObjects}
      onNavigateGrants={onNavigateGrants}
      onSelectDatabase={onSelectGrantsDatabase}
      ownedObjects={ownedObjects}
      publicGrants={publicGrants}
      roleName={role.roleName}
      selectedDatabaseId={effectiveDbId ?? undefined}
    />
  );
}

export { RoleGrantsTab };
