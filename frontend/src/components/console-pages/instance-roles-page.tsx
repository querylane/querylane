"use client";

import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  PageHeader,
  ResourcePageState,
} from "@/components/console-pages/console-layout";
import {
  type InstanceRolesSearch,
  type InstanceRolesTab,
  isInstanceRolesTab,
} from "@/components/console-pages/instance-roles-search";
import { RoleAvatar } from "@/components/console-pages/role-avatar";
import { RoleKindBadge } from "@/components/console-pages/role-kind-badge";
import { RolesAccessMapCanvas } from "@/components/console-pages/roles-access-map-canvas";
import {
  buildRolesAccessMapModel,
  type RoleMapKindVisibility,
} from "@/components/console-pages/roles-access-map-model";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
  SortableHeader,
} from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  rolesForInstanceQueryInput,
  useListAllRolesQuery,
  useRolesAccessMapResourcesQuery,
} from "@/hooks/api/role";
import { handleNavigationResult } from "@/lib/navigation-errors";
import {
  deriveRoleKind,
  isPredefinedRoleName,
  predefinedRoleInfo,
  type RoleKind,
  roleIdOf,
} from "@/lib/role-display";
import { useUrlTableSearch } from "@/lib/url-search-state";
import type { Role } from "@/protogen/querylane/console/v1alpha1/role_pb";

type KindFilter = "all" | RoleKind;
type RolesNavigateSearch = Record<string, unknown> & InstanceRolesSearch;

const DEFAULT_ROLE_MAP_KIND_VISIBILITY = {
  builtin: true,
  group: true,
  login: true,
  repl: true,
  super: true,
} satisfies RoleMapKindVisibility;

const KIND_FILTERS: { id: KindFilter; label: string; tip: string }[] = [
  { id: "all", label: "All", tip: "Every role on this database" },
  {
    id: "login",
    label: "Users",
    tip: "Roles that can connect (LOGIN, not SUPERUSER)",
  },
  {
    id: "super",
    label: "Superusers",
    tip: "Roles with SUPERUSER — bypass all checks",
  },
  {
    id: "group",
    label: "Groups",
    tip: "NOLOGIN roles used to bundle privileges",
  },
  {
    id: "repl",
    label: "Replicators",
    tip: "Roles with REPLICATION (no superuser)",
  },
  {
    id: "builtin",
    label: "Built-in",
    tip: "Predefined pg_* roles — grant implicit privileges to their members",
  },
];

function roleMapVisibilityForType(type: RoleKind | undefined) {
  if (type === undefined) {
    return DEFAULT_ROLE_MAP_KIND_VISIBILITY;
  }
  return {
    builtin: type === "builtin",
    group: type === "group",
    login: type === "login",
    repl: type === "repl",
    super: type === "super",
  } satisfies RoleMapKindVisibility;
}

function connLimitLabel(limit: number): string {
  return limit < 0 ? "∞" : String(limit);
}

function NameCell({ role }: { role: Role }) {
  const kind = deriveRoleKind(role);
  const isSystem = role.isSystemRole || isPredefinedRoleName(role.roleName);
  const builtinInfo = predefinedRoleInfo(role.roleName);
  // Built-in roles get their real predefined-role summary; ordinary roles show
  // their COMMENT ON ROLE text when present.
  const comment = isSystem ? undefined : role.comment || undefined;
  const subtitle = isSystem && builtinInfo ? builtinInfo.summary : comment;
  return (
    <div className="flex items-center gap-3">
      <RoleAvatar kind={kind} size="sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium font-mono text-sm">
            {role.roleName}
          </span>
          <RoleKindBadge role={role} />
        </div>
        {subtitle ? (
          <div className="truncate text-muted-foreground text-xs">
            <span className="truncate">{subtitle}</span>
          </div>
        ) : null}
      </div>
      <ChevronRight
        aria-hidden="true"
        className="ml-auto size-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
      />
    </div>
  );
}

function LoginCell({ role }: { role: Role }) {
  if (role.attributes?.canLogin) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Yes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/35" />
      <span>No</span>
    </span>
  );
}

const COLUMNS: DataTableColumnDef<Role>[] = [
  {
    accessorKey: "roleName",
    cell: ({ row }) => <NameCell role={row.original} />,
    header: ({ column }) => (
      <SortableHeader column={column}>Role</SortableHeader>
    ),
    meta: { headerClassName: "pl-3" },
  },
  {
    cell: ({ row }) => <LoginCell role={row.original} />,
    enableSorting: false,
    header: "Login",
    id: "login",
  },
  {
    accessorFn: (role) => role.attributes?.connectionLimit ?? -1,
    cell: ({ row }) => (
      <span className="font-mono tabular-nums">
        {connLimitLabel(row.original.attributes?.connectionLimit ?? -1)}
      </span>
    ),
    header: ({ column }) => (
      <SortableHeader column={column}>Conn limit</SortableHeader>
    ),
    id: "connLimit",
    sortFn: "basic",
  },
];

export function InstanceRolesPage({
  instanceId,
  tab,
  type,
}: {
  instanceId: string;
  tab?: InstanceRolesTab | undefined;
  type?: RoleKind | undefined;
}) {
  const [filter, setFilter] = useUrlTableSearch();
  const [roleSelectedNodeId, setRoleSelectedNodeId] = useState<string | null>(
    null
  );
  const navigate = useNavigate({ from: "/instances/$instanceId/roles/" });
  const [optimisticTab, setOptimisticTab] =
    useState<InstanceRolesTab>("details");
  const activeTab = tab ?? optimisticTab;

  const rolesQuery = useListAllRolesQuery(
    rolesForInstanceQueryInput(instanceId)
  );
  const roles = rolesQuery.data?.roles ?? [];

  const counts: Record<KindFilter, number> = {
    all: roles.length,
    builtin: 0,
    group: 0,
    login: 0,
    repl: 0,
    super: 0,
  };
  let loginCount = 0;
  const kinds = roles.map((role) => {
    const kind = deriveRoleKind(role);
    counts[kind] += 1;
    if (role.attributes?.canLogin) {
      loginCount += 1;
    }
    return kind;
  });

  const kindFiltered =
    type === undefined
      ? roles
      : roles.filter((_, index) => kinds[index] === type);
  const accessMapResourcesQuery = useRolesAccessMapResourcesQuery(
    { instanceId, roles },
    { enabled: activeTab === "map" && roles.length > 0 }
  );
  const roleMapModel = buildRolesAccessMapModel({
    publicAccess: accessMapResourcesQuery.data?.publicAccess ?? [],
    roleAccess: accessMapResourcesQuery.data?.roleAccess ?? [],
    roles,
    search: filter,
    visibleKinds: roleMapVisibilityForType(type),
  });

  function handleRolesTabChange(next: string) {
    if (!isInstanceRolesTab(next)) {
      return;
    }
    setOptimisticTab(next);
    handleNavigationResult(
      navigate({
        params: { instanceId },
        replace: false,
        resetScroll: false,
        search: (previous: RolesNavigateSearch) => ({
          ...previous,
          tab: next === "details" ? undefined : next,
        }),
        to: "/instances/$instanceId/roles",
      }),
      { area: "roles.tab" }
    );
  }

  function handleRoleTypeChange(nextType: RoleKind | undefined) {
    handleNavigationResult(
      navigate({
        params: { instanceId },
        replace: false,
        resetScroll: false,
        search: (previous: RolesNavigateSearch) => ({
          ...previous,
          type: nextType,
        }),
        to: "/instances/$instanceId/roles",
      }),
      { area: "roles.type-filter" }
    );
  }

  const rolesDetailsContent = (
    <div className="flex flex-col gap-4">
      {kindFiltered.length === 0 && roles.length > 0 ? (
        <SearchEmptyState resourceName="roles" />
      ) : (
        <DataTable
          columns={COLUMNS}
          data={kindFiltered}
          emptyResourceName="roles"
          filterColumn="roleName"
          filterValue={filter}
          initialSorting={[{ desc: false, id: "roleName" }]}
          onFilterChange={setFilter}
          onRowClick={(role) =>
            handleNavigationResult(
              navigate({
                params: { instanceId, roleId: roleIdOf(role) },
                search: {},
                to: "/instances/$instanceId/roles/$roleId",
              }),
              { area: "roles.open-detail" }
            )
          }
          pageSize={15}
          tableKey="instance-roles"
        />
      )}
    </div>
  );

  const rolesMapContent = (
    <div className="grid gap-3">
      <div className="inline-flex w-fit items-center rounded-lg border bg-background px-3 py-2 text-sm">
        Attribute: any
      </div>
      {accessMapResourcesQuery.isPending ? (
        <p className="text-muted-foreground text-sm" role="status">
          Loading role object access.
        </p>
      ) : null}
      {accessMapResourcesQuery.error ? (
        <p className="text-destructive text-sm" role="alert">
          Object access failed to load: {accessMapResourcesQuery.error.message}
        </p>
      ) : null}
      <RolesAccessMapCanvas
        model={roleMapModel}
        onSelectNode={setRoleSelectedNodeId}
        selectedNodeId={roleSelectedNodeId}
      />
    </div>
  );
  return (
    <ResourcePageState
      area="console.roles"
      error={rolesQuery.error}
      hasData={Boolean(rolesQuery.data)}
      loading={rolesQuery.isPending}
      retry={rolesQuery.refetch}
      title="Roles"
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          description={`${counts.all} role${counts.all === 1 ? "" : "s"} · ${loginCount} can log in · ${counts.group} group${counts.group === 1 ? "" : "s"} · ${counts.builtin} built-in`}
          eyebrow="Instance"
          title="Roles"
        />

        <Tabs
          className="w-full"
          onValueChange={handleRolesTabChange}
          value={activeTab}
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <TabsList>
                <TabsTrigger value="details">Table</TabsTrigger>
                <TabsTrigger value="map">Access map</TabsTrigger>
              </TabsList>
              <DataTableFilter
                onChange={setFilter}
                placeholder="Search roles..."
                value={filter}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {KIND_FILTERS.map((entry) => {
                const active =
                  entry.id === "all" ? type === undefined : type === entry.id;
                const nextType = entry.id === "all" ? undefined : entry.id;
                return (
                  <Button
                    key={entry.id}
                    onClick={() => handleRoleTypeChange(nextType)}
                    size="sm"
                    title={entry.tip}
                    type="button"
                    variant={active ? "secondary" : "outline"}
                  >
                    {entry.label}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {counts[entry.id]}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
          <TabsContent className="mt-4" value="details">
            {rolesDetailsContent}
          </TabsContent>
          <TabsContent className="mt-4" value="map">
            {rolesMapContent}
          </TabsContent>
        </Tabs>
      </div>
    </ResourcePageState>
  );
}
