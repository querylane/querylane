"use client";

import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  Crown,
  Maximize2,
  Minimize2,
  RadioTower,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  PageHeader,
  ResourcePageState,
} from "@/components/console-pages/console-layout";
import {
  type InstanceRolesSearch,
  type InstanceRolesTab,
  isInstanceRolesTab,
  isInstanceRolesType,
} from "@/components/console-pages/instance-roles-search";
import { RoleAvatar } from "@/components/console-pages/role-avatar";
import { RoleKindBadge } from "@/components/console-pages/role-kind-badge";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumnDef,
  DataTableFilter,
  SortableHeader,
} from "@/components/ui/data-table";
import { DataTableFacetedFilter } from "@/components/ui/data-table-faceted-filter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDatabaseVisualizationStore,
  type VisualizationDirection,
} from "@/features/database-visualization/database-visualization-store";
import type {
  VisualizationEdge,
  VisualizationNavigation,
  VisualizationNode,
} from "@/features/database-visualization/graph-model";
import {
  rolesForInstanceQueryInput,
  useListAllRolesQuery,
} from "@/hooks/api/role";
import { parseResourceLeafId } from "@/lib/console-resources";
import { handleNavigationResult } from "@/lib/navigation-errors";
import {
  deriveRoleKind,
  isPredefinedRoleName,
  predefinedRoleInfo,
  ROLE_KIND_LABEL,
  type RoleKind,
  roleIdOf,
} from "@/lib/role-display";
import { useUrlTableSearch } from "@/lib/url-search-state";
import type { Role } from "@/protogen/querylane/console/v1alpha1/role_pb";

type KindFilter = "all" | RoleKind;
type RoleMapVisibleKind = Exclude<KindFilter, "all">;
type RoleMapKindVisibility = Record<RoleMapVisibleKind, boolean>;
type RolesNavigateSearch = Record<string, unknown> & InstanceRolesSearch;

interface RoleSpaceMapModel {
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
}

const FlowCanvas = lazy(() =>
  import("@/features/database-visualization/flow-canvas").then((module) => ({
    default: module.FlowCanvas,
  }))
);

const DEFAULT_ROLE_MAP_KIND_VISIBILITY = {
  builtin: false,
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

const ROLE_MAP_FILTERS = KIND_FILTERS.filter(
  (filter): filter is { id: RoleMapVisibleKind; label: string; tip: string } =>
    filter.id !== "all"
);

const ROLE_TYPE_FILTERS = KIND_FILTERS.filter(
  (filter): filter is { id: RoleKind; label: string; tip: string } =>
    filter.id !== "all"
);

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

function roleNodeBadges(role: Role, kind: RoleKind): string[] {
  const badges = new Set([ROLE_KIND_LABEL[kind].toUpperCase()]);
  if (role.attributes?.canLogin) {
    badges.add("LOGIN");
  }
  if (role.attributes?.isSuperuser) {
    badges.add("SUPERUSER");
  }
  if (role.attributes?.canReplicate) {
    badges.add("REPLICATION");
  }
  if (role.isSystemRole || isPredefinedRoleName(role.roleName)) {
    badges.add("BUILT-IN");
  }
  return [...badges];
}

function roleNodeLines(role: Role): string[] {
  const memberCount = role.memberOf.length;
  const lines = [`${memberCount} parent role${memberCount === 1 ? "" : "s"}`];
  if (role.comment) {
    lines.push(role.comment);
  }
  return lines;
}

function addRoleNode({
  kind,
  nodes,
  role,
  roleId,
  seenNodeIds,
}: {
  kind: RoleKind;
  nodes: VisualizationNode[];
  role: Role;
  roleId: string;
  seenNodeIds: Set<string>;
}) {
  const nodeId = `role:${roleId}`;
  if (seenNodeIds.has(nodeId)) {
    return;
  }
  seenNodeIds.add(nodeId);
  nodes.push({
    data: {
      badges: roleNodeBadges(role, kind),
      lines: roleNodeLines(role),
      navigation: { roleId, to: "role" },
      subtitle: ROLE_KIND_LABEL[kind],
      title: role.roleName,
    },
    id: nodeId,
    kind: "role",
  });
}

function addReferencedRoleNode({
  nodes,
  roleId,
  roleName,
  seenNodeIds,
  visibleKinds,
}: {
  nodes: VisualizationNode[];
  roleId: string;
  roleName: string;
  seenNodeIds: Set<string>;
  visibleKinds: RoleMapKindVisibility;
}) {
  const inferredKind: RoleMapVisibleKind = isPredefinedRoleName(roleName)
    ? "builtin"
    : "group";
  if (!visibleKinds[inferredKind]) {
    return;
  }
  const nodeId = `role:${roleId}`;
  if (seenNodeIds.has(nodeId)) {
    return;
  }
  seenNodeIds.add(nodeId);
  nodes.push({
    data: {
      badges: [ROLE_KIND_LABEL[inferredKind].toUpperCase()],
      lines: ["Referenced by membership"],
      navigation: { roleId, to: "role" },
      subtitle: ROLE_KIND_LABEL[inferredKind],
      title: roleName,
    },
    id: nodeId,
    kind: "role",
  });
}

function membershipTarget(
  membership: Role["memberOf"][number],
  roleIdByName: Map<string, string>
): { roleId: string; roleName: string } | null {
  const roleName =
    membership.roleName ||
    (membership.role ? parseResourceLeafId(membership.role) : "");
  const roleId =
    (membership.role ? parseResourceLeafId(membership.role) : "") ||
    roleIdByName.get(roleName) ||
    roleName;
  if (!roleId) {
    return null;
  }
  return { roleId, roleName: roleName || roleId };
}

function appendMembershipEdges({
  edges,
  nodes,
  role,
  roleIdByName,
  seenNodeIds,
  visibleKinds,
}: {
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
  role: Role;
  roleIdByName: Map<string, string>;
  seenNodeIds: Set<string>;
  visibleKinds: RoleMapKindVisibility;
}) {
  const sourceId = `role:${roleIdOf(role)}`;
  if (!seenNodeIds.has(sourceId)) {
    return;
  }
  for (const membership of role.memberOf) {
    const target = membershipTarget(membership, roleIdByName);
    if (!target) {
      continue;
    }
    addReferencedRoleNode({
      nodes,
      roleId: target.roleId,
      roleName: target.roleName,
      seenNodeIds,
      visibleKinds,
    });
    const targetId = `role:${target.roleId}`;
    if (!seenNodeIds.has(targetId)) {
      continue;
    }
    edges.push({
      id: `${sourceId}->${targetId}`,
      label: "member of",
      source: sourceId,
      target: targetId,
    });
  }
}

function buildRoleSpaceMapModel({
  roles,
  visibleKinds,
}: {
  roles: Role[];
  visibleKinds: RoleMapKindVisibility;
}): RoleSpaceMapModel {
  const roleIdByName = new Map(
    roles.map((role) => [role.roleName, roleIdOf(role)])
  );
  const nodes: VisualizationNode[] = [];
  const edges: VisualizationEdge[] = [];
  const seenNodeIds = new Set<string>();

  for (const role of roles) {
    const kind = deriveRoleKind(role);
    if (!visibleKinds[kind]) {
      continue;
    }
    addRoleNode({
      kind,
      nodes,
      role,
      roleId: roleIdOf(role),
      seenNodeIds,
    });
  }

  for (const role of roles) {
    appendMembershipEdges({
      edges,
      nodes,
      role,
      roleIdByName,
      seenNodeIds,
      visibleKinds,
    });
  }

  return { edges, nodes };
}

function RoleMapStatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="size-5 text-primary" />
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider">
            {label}
          </p>
          <p className="font-semibold text-lg tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleSpaceMapActions({
  direction,
  hiddenKindCount,
  isExpanded,
  onCollapse,
  onExpand,
  onToggleDirection,
  onToggleKind,
  visibleKinds,
}: {
  direction: VisualizationDirection;
  hiddenKindCount: number;
  isExpanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onToggleDirection: () => void;
  onToggleKind: (kind: RoleMapVisibleKind, visible: boolean) => void;
  visibleKinds: RoleMapKindVisibility;
}) {
  return (
    <div className="flex max-w-[min(calc(100vw-2rem),720px)] flex-wrap justify-end gap-2">
      <Button
        onClick={onToggleDirection}
        size="sm"
        type="button"
        variant="outline"
      >
        Switch to {direction === "LR" ? "vertical" : "horizontal"}
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button size="sm" type="button" variant="outline">
              <SlidersHorizontal className="size-3.5" />
              Resource filters
              {hiddenKindCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground"
                >
                  {hiddenKindCount}
                </span>
              ) : null}
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-[min(calc(100vw-2rem),22rem)] gap-3 p-3"
        >
          <PopoverHeader>
            <PopoverTitle>Role filters</PopoverTitle>
            <PopoverDescription>
              Add or remove role categories from this access map.
            </PopoverDescription>
          </PopoverHeader>
          <div className="grid min-w-0 gap-2 overflow-hidden">
            {ROLE_MAP_FILTERS.map((filter) => {
              const switchId = `role-map-filter-${filter.id}`;
              return (
                <div
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card/80 py-2 pr-5 pl-2"
                  key={filter.id}
                >
                  <div className="min-w-0">
                    <Label htmlFor={switchId}>{filter.label}</Label>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      {filter.tip}
                    </p>
                  </div>
                  <Switch
                    checked={visibleKinds[filter.id]}
                    className="justify-self-end"
                    id={switchId}
                    onCheckedChange={(checked) =>
                      onToggleKind(filter.id, checked)
                    }
                    size="sm"
                  />
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        aria-label={
          isExpanded ? "Collapse role access map" : "Expand role access map"
        }
        onClick={isExpanded ? onCollapse : onExpand}
        size="sm"
        type="button"
        variant="outline"
      >
        {isExpanded ? (
          <>
            <Minimize2 className="size-3.5" />
            Collapse
          </>
        ) : (
          <>
            <Maximize2 className="size-3.5" />
            Expand
          </>
        )}
      </Button>
    </div>
  );
}

function RoleMapSection({
  counts,
  direction,
  expandedRoleMapActions,
  isRoleMapExpanded,
  onNavigate,
  onOpenExpandedChange,
  onSelectNode,
  roleMapActions,
  roleMapModel,
  roleSelectedNodeId,
}: {
  counts: Record<KindFilter, number>;
  direction: VisualizationDirection;
  expandedRoleMapActions: React.ReactNode;
  isRoleMapExpanded: boolean;
  onNavigate: (navigation: VisualizationNavigation) => void;
  onOpenExpandedChange: (open: boolean) => void;
  onSelectNode: (nodeId: string | null) => void;
  roleMapActions: React.ReactNode;
  roleMapModel: RoleSpaceMapModel;
  roleSelectedNodeId: string | null;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-xl tracking-tight">
              Role access map
            </h2>
            <Badge variant="secondary">Full map</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            Shows users, groups, superusers, replicators, and role membership.
            Use filters to add built-in roles.
          </p>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <RoleMapStatCard icon={UserRound} label="Users" value={counts.login} />
        <RoleMapStatCard
          icon={UsersRound}
          label="Groups"
          value={counts.group}
        />
        <RoleMapStatCard icon={Crown} label="Superusers" value={counts.super} />
        <RoleMapStatCard
          icon={RadioTower}
          label="Replicators"
          value={counts.repl}
        />
        <RoleMapStatCard
          icon={ShieldCheck}
          label="Built-in"
          value={counts.builtin}
        />
      </div>
      <Suspense
        fallback={
          <Card>
            <CardContent className="p-4 text-muted-foreground text-sm">
              Loading role access map.
            </CardContent>
          </Card>
        }
      >
        <FlowCanvas
          actionPanel={roleMapActions}
          density="compact"
          direction={direction}
          edges={roleMapModel.edges}
          nodes={roleMapModel.nodes}
          onNavigate={onNavigate}
          onSelectNode={onSelectNode}
          selectedNodeId={roleSelectedNodeId}
        />
      </Suspense>
      <Dialog onOpenChange={onOpenExpandedChange} open={isRoleMapExpanded}>
        <DialogContent className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] p-4 sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Expanded role access map</DialogTitle>
            <DialogDescription>
              Explore every role category and membership edge with more room.
            </DialogDescription>
          </DialogHeader>
          <Suspense
            fallback={
              <Card>
                <CardContent className="p-4 text-muted-foreground text-sm">
                  Loading role access map.
                </CardContent>
              </Card>
            }
          >
            <FlowCanvas
              actionPanel={expandedRoleMapActions}
              className="min-h-0"
              density="compact"
              direction={direction}
              edges={roleMapModel.edges}
              nodes={roleMapModel.nodes}
              onNavigate={onNavigate}
              onSelectNode={onSelectNode}
              selectedNodeId={roleSelectedNodeId}
            />
          </Suspense>
        </DialogContent>
      </Dialog>
    </section>
  );
}

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
  const [isRoleMapExpanded, setIsRoleMapExpanded] = useState(false);
  const [visibleRoleKinds, setVisibleRoleKinds] =
    useState<RoleMapKindVisibility>(DEFAULT_ROLE_MAP_KIND_VISIBILITY);
  const { direction, roleSelectedNodeId, setDirection, setRoleSelectedNodeId } =
    useDatabaseVisualizationStore(
      useShallow((state) => ({
        direction: state.direction,
        roleSelectedNodeId: state.roleSelectedNodeId,
        setDirection: state.setDirection,
        setRoleSelectedNodeId: state.setRoleSelectedNodeId,
      }))
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
  const roleMapModel = buildRoleSpaceMapModel({
    roles,
    visibleKinds: visibleRoleKinds,
  });
  const hiddenKindCount = ROLE_MAP_FILTERS.filter(
    (filterOption) => !visibleRoleKinds[filterOption.id]
  ).length;
  const roleMapActions = (
    <RoleSpaceMapActions
      direction={direction}
      hiddenKindCount={hiddenKindCount}
      isExpanded={false}
      onCollapse={() => setIsRoleMapExpanded(false)}
      onExpand={() => setIsRoleMapExpanded(true)}
      onToggleDirection={toggleDirection}
      onToggleKind={setVisibleRoleKind}
      visibleKinds={visibleRoleKinds}
    />
  );
  const expandedRoleMapActions = (
    <RoleSpaceMapActions
      direction={direction}
      hiddenKindCount={hiddenKindCount}
      isExpanded={true}
      onCollapse={() => setIsRoleMapExpanded(false)}
      onExpand={() => setIsRoleMapExpanded(true)}
      onToggleDirection={toggleDirection}
      onToggleKind={setVisibleRoleKind}
      visibleKinds={visibleRoleKinds}
    />
  );

  function setVisibleRoleKind(kind: RoleMapVisibleKind, visible: boolean) {
    setVisibleRoleKinds((current) => ({
      ...current,
      [kind]: visible,
    }));
  }

  function toggleDirection() {
    setDirection(direction === "LR" ? "TB" : "LR");
  }

  function handleRoleMapNavigate(navigation: VisualizationNavigation) {
    if (navigation.to !== "role" || !navigation.roleId) {
      return;
    }
    handleNavigationResult(
      navigate({
        params: { instanceId, roleId: navigation.roleId },
        search: {},
        to: "/instances/$instanceId/roles/$roleId",
      }),
      { area: "roles.map.open-detail" }
    );
  }

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

  function handleRoleTypeChange(values: string[]) {
    const nextType = values.at(-1);
    if (nextType !== undefined && !isInstanceRolesType(nextType)) {
      return;
    }

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataTableFacetedFilter
          onSelectedValuesChange={handleRoleTypeChange}
          options={ROLE_TYPE_FILTERS.map((entry) => ({
            count: counts[entry.id],
            label: ROLE_KIND_LABEL[entry.id],
            value: entry.id,
          }))}
          selectedValues={type === undefined ? [] : [type]}
          singleSelect={true}
          title="Type"
        />
        <DataTableFilter
          onChange={setFilter}
          placeholder="Search roles..."
          value={filter}
        />
      </div>

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
    <RoleMapSection
      counts={counts}
      direction={direction}
      expandedRoleMapActions={expandedRoleMapActions}
      isRoleMapExpanded={isRoleMapExpanded}
      onNavigate={handleRoleMapNavigate}
      onOpenExpandedChange={setIsRoleMapExpanded}
      onSelectNode={setRoleSelectedNodeId}
      roleMapActions={roleMapActions}
      roleMapModel={roleMapModel}
      roleSelectedNodeId={roleSelectedNodeId}
    />
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
          description={`${counts.all} role${counts.all === 1 ? "" : "s"} · ${loginCount} can log in · ${counts.group} group${counts.group === 1 ? "" : "s"}`}
          eyebrow="Instance"
          title="Roles & Users"
        />

        <Tabs
          className="w-full"
          onValueChange={handleRolesTabChange}
          value={activeTab}
        >
          <div className="flex flex-wrap items-center justify-end gap-3">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
            </TabsList>
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
