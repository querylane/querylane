"use client";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  buildAccessRows,
  builtinDetailText,
  connLimitDisplay,
  deriveBuiltinParents,
  directGrantsSubText,
  facetStateOf,
  ownedSubText,
  type RelatedRole,
  rlsNoteText,
  type Section,
  shouldLoadRoleFacets,
} from "@/components/console-pages/role-detail-model";
import type {
  GrantsReach,
  GrantsType,
  GrantsView,
  RoleTab,
} from "@/components/console-pages/role-detail-search";
import { RoleDetailView } from "@/components/console-pages/role-detail-view";
import {
  aggregateGrants,
  type FacetStates,
  TABLE_LIKE_TYPES,
} from "@/components/console-pages/role-grants-shared";
import {
  publicGrantsForDatabaseQueryInput,
  roleDefaultPrivilegesForDatabaseQueryInput,
  roleGrantsForDatabaseQueryInput,
  roleOwnedObjectsForDatabaseQueryInput,
  useListPublicGrantsQuery,
  useListRoleDefaultPrivilegesQuery,
  useListRoleGrantsQuery,
  useListRoleOwnedObjectsQuery,
} from "@/hooks/api/role";
import { parseResourceLeafId } from "@/lib/console-resources";
import { useDb } from "@/lib/db-context";
import { handleNavigationError } from "@/lib/navigation-errors";
import {
  buildRoleSql,
  deriveRoleKind,
  isPredefinedRoleName,
  type MemberEntry,
  membershipOptionBadges,
  passwordExpiryStatus,
  predefinedRoleInfo,
} from "@/lib/role-display";
import type { Role } from "@/protogen/querylane/console/v1alpha1/role_pb";

function resolveGrantsView(
  section: Section,
  grantsReach: GrantsReach | undefined,
  grantsSchema: string | undefined,
  grantsType: GrantsType | undefined
): GrantsView {
  if (section !== "grants") {
    return { kind: "overview" };
  }
  if (grantsReach) {
    return { kind: "reach", reach: grantsReach };
  }
  if (grantsSchema) {
    return { kind: "schema", schema: grantsSchema, type: grantsType };
  }
  return { kind: "overview" };
}

// Direct object grants for the selected database, aggregated to one entry per
// object (the page is object-centric, so KPIs and tabs count distinct objects).
function useRoleGrants({
  effectiveDbId,
  instanceId,
  loadGrants,
  roleId,
}: {
  effectiveDbId: string | null;
  instanceId: string;
  loadGrants: boolean;
  roleId: string;
}) {
  const queryEnabled = effectiveDbId !== null && loadGrants;
  const grantsQuery = useListRoleGrantsQuery(
    roleGrantsForDatabaseQueryInput({
      databaseId: effectiveDbId ?? "",
      instanceId,
      roleId,
    }),
    { enabled: queryEnabled }
  );
  const grantObjects = aggregateGrants(grantsQuery.data?.grants ?? []);
  const grantSchemaNames = new Set<string>();
  for (const object of grantObjects) {
    if (object.schemaName) {
      grantSchemaNames.add(object.schemaName);
    }
  }
  return {
    grantObjects,
    grantSchemaCount: grantSchemaNames.size,
    grantsDeferred:
      effectiveDbId !== null && !loadGrants && grantsQuery.data === undefined,
    grantsError: grantsQuery.error,
    grantsPartial:
      effectiveDbId !== null && Boolean(grantsQuery.data?.nextPageToken),
    grantsPending: grantsQuery.isPending,
    grantsReady:
      effectiveDbId !== null &&
      grantsQuery.data !== undefined &&
      !grantsQuery.isPending &&
      !grantsQuery.error,
  };
}

// The three security facets (owned objects, PUBLIC grants, default privileges),
// scoped to the selected database and suppressed for built-in roles. Returns the
// data plus each facet's load state, keeping the query wiring out of the view.
function useRoleFacets({
  effectiveDbId,
  instanceId,
  isSystem,
  loadFacets,
  roleId,
}: {
  effectiveDbId: string | null;
  instanceId: string;
  isSystem: boolean;
  loadFacets: boolean;
  roleId: string;
}) {
  const facetsEnabled = effectiveDbId !== null && !isSystem;
  const queryEnabled = facetsEnabled && loadFacets;
  const databaseId = effectiveDbId ?? "";
  const ownedObjectsQuery = useListRoleOwnedObjectsQuery(
    roleOwnedObjectsForDatabaseQueryInput({ databaseId, instanceId, roleId }),
    { enabled: queryEnabled }
  );
  const publicGrantsQuery = useListPublicGrantsQuery(
    publicGrantsForDatabaseQueryInput({ databaseId, instanceId }),
    { enabled: queryEnabled }
  );
  const defaultPrivilegesQuery = useListRoleDefaultPrivilegesQuery(
    roleDefaultPrivilegesForDatabaseQueryInput({
      databaseId,
      instanceId,
      roleId,
    }),
    { enabled: queryEnabled }
  );
  const ownedReady =
    facetsEnabled &&
    ownedObjectsQuery.data !== undefined &&
    !ownedObjectsQuery.isPending &&
    !ownedObjectsQuery.error;
  return {
    defaultPrivileges: defaultPrivilegesQuery.data?.defaultPrivileges ?? [],
    defaultPrivilegesPartial:
      facetsEnabled && Boolean(defaultPrivilegesQuery.data?.nextPageToken),
    facetStates: {
      defaults: facetStateOf(facetsEnabled, defaultPrivilegesQuery, {
        deferred:
          facetsEnabled &&
          !loadFacets &&
          defaultPrivilegesQuery.data === undefined,
      }),
      owned: facetStateOf(facetsEnabled, ownedObjectsQuery, {
        deferred:
          facetsEnabled && !loadFacets && ownedObjectsQuery.data === undefined,
      }),
      publicGrants: facetStateOf(facetsEnabled, publicGrantsQuery, {
        deferred:
          facetsEnabled && !loadFacets && publicGrantsQuery.data === undefined,
      }),
    } satisfies FacetStates,
    ownedError: ownedObjectsQuery.error,
    ownedObjects: ownedObjectsQuery.data?.ownedObjects ?? [],
    ownedPartial:
      facetsEnabled && Boolean(ownedObjectsQuery.data?.nextPageToken),
    ownedReady,
    publicGrants: publicGrantsQuery.data?.grants ?? [],
    publicGrantsPartial:
      facetsEnabled && Boolean(publicGrantsQuery.data?.nextPageToken),
  };
}

// The three URL-driven navigation handlers for the role detail page, grouped so
// RoleDetailContent stays focused on its view model rather than search wiring.
function useGrantsNavigation(setChosenDbId: (next: string) => void) {
  const navigate = useNavigate({
    from: "/instances/$instanceId/roles/$roleId",
  });
  const setSection = (next: Section) => {
    const stayOnGrants = next === "grants";
    navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        // The grants drill-in is only meaningful on the grants tab; drop it
        // when leaving so a later visit lands on the grants overview.
        grantsReach: stayOnGrants ? previous.grantsReach : undefined,
        grantsSchema: stayOnGrants ? previous.grantsSchema : undefined,
        grantsType: stayOnGrants ? previous.grantsType : undefined,
        tab: next === "overview" ? undefined : next,
      }),
    }).catch((error: unknown) =>
      handleNavigationError(error, { area: "role-detail.section" })
    );
  };
  const onNavigateGrants = (next: GrantsView) => {
    navigate({
      // replace:false so the browser Back button steps a drill-in back to the
      // grants overview rather than leaving the page.
      replace: false,
      search: (previous) => ({
        ...previous,
        grantsReach: next.kind === "reach" ? next.reach : undefined,
        grantsSchema: next.kind === "schema" ? next.schema : undefined,
        grantsType: next.kind === "schema" ? next.type : undefined,
        tab: "grants",
      }),
    }).catch((error: unknown) =>
      handleNavigationError(error, { area: "role-detail.grants" })
    );
  };
  // Switching databases from inside the Grants tab: a drilled-in schema/reach
  // may not exist in the new database, so reset to the grants overview.
  const onSelectGrantsDatabase = (next: string) => {
    setChosenDbId(next);
    navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        grantsReach: undefined,
        grantsSchema: undefined,
        grantsType: undefined,
      }),
    }).catch((error: unknown) =>
      handleNavigationError(error, { area: "role-detail.grants-database" })
    );
  };
  return { onNavigateGrants, onSelectGrantsDatabase, setSection };
}

function RoleDetailContent({
  grantsReach,
  grantsSchema,
  grantsType,
  instanceId,
  members,
  role,
  roleId,
  tab,
}: {
  grantsReach: GrantsReach | undefined;
  grantsSchema: string | undefined;
  grantsType: GrantsType | undefined;
  instanceId: string;
  members: MemberEntry[];
  role: Role;
  roleId: string;
  tab: RoleTab | undefined;
}) {
  // The selected tab lives in the URL (?tab=…) so it survives reload and can be
  // shared; "overview" is the default and is omitted from the URL.
  const section: Section = tab ?? "overview";
  const { databases, selectedDatabase } = useDb();
  const [chosenDbId, setChosenDbId] = useState<string | null>(null);
  const { onNavigateGrants, onSelectGrantsDatabase, setSection } =
    useGrantsNavigation(setChosenDbId);
  const grantsView = resolveGrantsView(
    section,
    grantsReach,
    grantsSchema,
    grantsType
  );
  const { attributes } = role;
  const kind = deriveRoleKind(role);
  const isSystem = role.isSystemRole || isPredefinedRoleName(role.roleName);
  const builtinInfo = predefinedRoleInfo(role.roleName);
  const expiry = passwordExpiryStatus(attributes?.validUntil);
  const comment = isSystem ? undefined : role.comment || undefined;

  const effectiveDbId =
    chosenDbId ?? selectedDatabase?.id ?? databases[0]?.id ?? null;
  const effectiveDb =
    databases.find((database) => database.id === effectiveDbId) ?? null;
  const {
    grantObjects,
    grantSchemaCount,
    grantsDeferred,
    grantsError,
    grantsPartial,
    grantsPending,
    grantsReady,
  } = useRoleGrants({
    effectiveDbId,
    instanceId,
    loadGrants: isSystem || shouldLoadRoleFacets(section),
    roleId,
  });

  const directGrantsSub = directGrantsSubText({
    deferred: grantsDeferred,
    effectiveDbId,
    error: grantsError,
    grantSchemaCount,
    grantsReady,
  });

  // Security facets, scoped to the selected database. The "Owns" KPI mirrors the
  // "Direct grants" KPI: show "—"/"Unavailable" while the owned-objects query is
  // pending or failed, rather than asserting "no owned objects" from an empty
  // default.
  const {
    defaultPrivileges,
    defaultPrivilegesPartial,
    facetStates,
    ownedError,
    ownedObjects,
    ownedPartial,
    ownedReady,
    publicGrants,
    publicGrantsPartial,
  } = useRoleFacets({
    effectiveDbId,
    instanceId,
    isSystem,
    loadFacets: shouldLoadRoleFacets(section),
    roleId,
  });
  const ownedSub = ownedSubText({
    databaseName: effectiveDb?.name,
    deferred: facetStates.owned === "idle",
    effectiveDbId,
    error: ownedError,
    ownedCount: ownedObjects.length,
    ownedReady,
  });
  const partialAccess =
    grantsPartial ||
    ownedPartial ||
    publicGrantsPartial ||
    defaultPrivilegesPartial;

  const belongsTo: RelatedRole[] = role.memberOf.map((membership) => ({
    grantor: membership.grantor || undefined,
    options: membershipOptionBadges(membership),
    roleId: parseResourceLeafId(membership.role),
    roleName: membership.roleName,
  }));
  const memberRows: RelatedRole[] = members.map((member) => ({
    options: membershipOptionBadges(member),
    roleId: member.roleId,
    roleName: member.roleName,
  }));
  const sql = buildRoleSql(role);

  const connLimit = attributes?.connectionLimit ?? -1;
  const connLimitSub = attributes?.canLogin
    ? connLimitDisplay(connLimit)
    : undefined;

  // Built-in access via membership: a normal role that is a member of a pg_*
  // role (the case users care about). Direct parents only; recursive closure
  // is out of scope for now. Names drive the access spine; details drive the
  // built-in role page's hierarchy block (e.g. pg_monitor ⇒ pg_read_all_settings).
  const { details: builtinParentDetails, names: builtinParents } =
    deriveBuiltinParents(role);
  const isSuperuser = Boolean(attributes?.isSuperuser);
  const bypassesRls = Boolean(attributes?.bypassesRls);
  const readWriteBuiltin = [
    role.roleName,
    ...role.memberOf.map((membership) => membership.roleName),
  ].some((name) => name === "pg_read_all_data" || name === "pg_write_all_data");
  const hasTableGrants = grantObjects.some((object) =>
    TABLE_LIKE_TYPES.has(object.objectType)
  );
  const tableAccessActive =
    hasTableGrants || ownedObjects.length > 0 || readWriteBuiltin;

  const rlsNote = rlsNoteText({ bypassesRls, isSuperuser, tableAccessActive });

  const builtinDetail = builtinDetailText(builtinInfo, builtinParents);
  const builtinActive = builtinInfo !== null || builtinParents.length > 0;

  const accessRows = buildAccessRows({
    belongsTo,
    builtinActive,
    builtinDetail,
    builtinInfo,
    builtinParents,
    effectiveDb,
    grantObjects,
    grantsDeferred,
    grantsReady,
    isSuperuser,
    ownedCount: ownedObjects.length,
    ownedState: facetStates.owned,
    publicCount: publicGrants.length,
    publicGrantsState: facetStates.publicGrants,
  });

  return (
    <RoleDetailView
      accessRows={accessRows}
      attributes={attributes}
      belongsTo={belongsTo}
      builtinInfo={builtinInfo}
      builtinParentDetails={builtinParentDetails}
      comment={comment ?? ""}
      connLimitSub={connLimitSub}
      databases={databases}
      defaultPrivileges={defaultPrivileges}
      defaultPrivilegesPartial={defaultPrivilegesPartial}
      directGrantsSub={directGrantsSub}
      effectiveDb={effectiveDb}
      effectiveDbId={effectiveDbId}
      expiry={expiry}
      facetStates={facetStates}
      grantObjects={grantObjects}
      grantsError={grantsError}
      grantsPartial={grantsPartial}
      grantsPending={grantsPending}
      grantsReady={grantsReady}
      grantsView={grantsView}
      instanceId={instanceId}
      isSystem={isSystem}
      kind={kind}
      memberRows={memberRows}
      onNavigateGrants={onNavigateGrants}
      onSelectGrantsDatabase={onSelectGrantsDatabase}
      ownedObjects={ownedObjects}
      ownedPartial={ownedPartial}
      ownedReady={ownedReady}
      ownedSub={ownedSub}
      partialAccess={partialAccess}
      publicGrants={publicGrants}
      publicGrantsPartial={publicGrantsPartial}
      rlsNote={rlsNote}
      role={role}
      section={section}
      setChosenDbId={setChosenDbId}
      setSection={setSection}
      sql={sql}
    />
  );
}

export { RoleDetailContent };
