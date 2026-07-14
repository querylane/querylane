"use client";

import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  GitBranch,
  KeyRound,
  Loader2,
  Maximize2,
  Minimize2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { RoleDetailViewProps } from "@/components/console-pages/role-detail-model";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type {
  AccessDefaultPrivilege,
  AccessGrant,
  AccessObjectType,
} from "@/features/database-visualization/access-map-model";
import { buildAccessMapModel } from "@/features/database-visualization/access-map-model";
import {
  useDatabaseVisualizationStore,
  type VisualizationDirection,
} from "@/features/database-visualization/database-visualization-store";
import type {
  VisualizationEdge,
  VisualizationNavigation,
  VisualizationNode,
} from "@/features/database-visualization/graph-model";
import { assertNever } from "@/lib/assert-never";
import { parseResourceLeafId } from "@/lib/console-resources";
import {
  DefaultPrivilegeObjectType,
  GrantObjectType,
} from "@/protogen/querylane/console/v1alpha1/role_pb";

const FlowCanvas = lazy(() =>
  import("@/features/database-visualization/flow-canvas").then((module) => ({
    default: module.FlowCanvas,
  }))
);

type AccessMapVisibleFacet =
  | "defaultPrivileges"
  | "directGrants"
  | "members"
  | "ownedObjects"
  | "parents"
  | "publicGrants";

type AccessMapFacetVisibility = Record<AccessMapVisibleFacet, boolean>;

const ACCESS_MAP_FACET_FILTERS = [
  {
    description: "Roles this role inherits from",
    kind: "parents",
    label: "Parents",
  },
  {
    description: "Roles that inherit from this role",
    kind: "members",
    label: "Members",
  },
  {
    description: "Explicit object privileges",
    kind: "directGrants",
    label: "Direct grants",
  },
  {
    description: "Objects owned by this role",
    kind: "ownedObjects",
    label: "Owned objects",
  },
  {
    description: "Privileges granted to PUBLIC",
    kind: "publicGrants",
    label: "PUBLIC grants",
  },
  {
    description: "Privileges for future objects",
    kind: "defaultPrivileges",
    label: "Default privileges",
  },
] satisfies {
  description: string;
  kind: AccessMapVisibleFacet;
  label: string;
}[];

const DEFAULT_ACCESS_MAP_FACET_VISIBILITY = {
  defaultPrivileges: true,
  directGrants: true,
  members: true,
  ownedObjects: true,
  parents: true,
  publicGrants: true,
} satisfies AccessMapFacetVisibility;

function grantObjectType(type: GrantObjectType): AccessObjectType | null {
  switch (type) {
    case GrantObjectType.DATABASE:
      return "database";
    case GrantObjectType.SCHEMA:
      return "schema";
    case GrantObjectType.TABLE:
      return "table";
    case GrantObjectType.VIEW:
      return "view";
    case GrantObjectType.MATERIALIZED_VIEW:
      return "materialized_view";
    case GrantObjectType.SEQUENCE:
      return "sequence";
    case GrantObjectType.FOREIGN_TABLE:
      return "foreign_table";
    case GrantObjectType.FUNCTION:
      return "function";
    case GrantObjectType.LARGE_OBJECT:
      return "large_object";
    case GrantObjectType.UNSPECIFIED:
      return null;
    default:
      return assertNever(type);
  }
}

function defaultObjectType(
  type: DefaultPrivilegeObjectType
): AccessObjectType | null {
  switch (type) {
    case DefaultPrivilegeObjectType.TABLES:
      return "tables";
    case DefaultPrivilegeObjectType.SEQUENCES:
      return "sequence";
    case DefaultPrivilegeObjectType.FUNCTIONS:
      return "function";
    case DefaultPrivilegeObjectType.TYPES:
      return "types";
    case DefaultPrivilegeObjectType.SCHEMAS:
      return "schema";
    case DefaultPrivilegeObjectType.LARGE_OBJECTS:
      return "large_objects";
    case DefaultPrivilegeObjectType.UNSPECIFIED:
      return null;
    default:
      return assertNever(type);
  }
}

function directGrantRows(props: RoleDetailViewProps): AccessGrant[] {
  return props.grantObjects.flatMap((object) => {
    const objectType = grantObjectType(object.objectType);
    if (objectType === null) {
      return [];
    }
    return object.privileges.map((privilege) => ({
      objectName: object.objectName,
      objectType,
      privilege: privilege.name,
      schemaName: object.schemaName,
      withGrantOption: privilege.grantable,
    }));
  });
}

function ownedObjectRows(props: RoleDetailViewProps): AccessGrant[] {
  return props.ownedObjects.flatMap((object) => {
    const objectType = grantObjectType(object.objectType);
    if (objectType === null) {
      return [];
    }
    return [
      {
        objectName: object.objectName,
        objectType,
        privilege: "OWNER",
        schemaName: object.schemaName,
        withGrantOption: false,
      },
    ];
  });
}

function publicGrantRows(props: RoleDetailViewProps): AccessGrant[] {
  return props.publicGrants.flatMap((grant) => {
    const objectType = grantObjectType(grant.objectType);
    if (objectType === null) {
      return [];
    }
    return [
      {
        objectName: grant.objectName,
        objectType,
        privilege: grant.privilege,
        schemaName: grant.schemaName,
        withGrantOption: grant.withGrantOption,
      },
    ];
  });
}

function defaultPrivilegeRows(
  props: RoleDetailViewProps
): AccessDefaultPrivilege[] {
  return props.defaultPrivileges.flatMap((privilege) => {
    const objectType = defaultObjectType(privilege.objectType);
    if (objectType === null) {
      return [];
    }
    return [
      {
        creatorRoleName: privilege.creatorRoleName,
        objectType,
        privilege: privilege.privilege,
        schemaName: privilege.schemaName,
        withGrantOption: privilege.withGrantOption,
      },
    ];
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown error occurred.";
}

function AccessMapLoadingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 className="size-4 animate-spin" /> Loading access map
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Preparing the role access canvas.
      </CardContent>
    </Card>
  );
}

function accessMapFacetForNode(
  node: VisualizationNode
): AccessMapVisibleFacet | null {
  if (node.id.startsWith("parent:")) {
    return "parents";
  }
  if (node.id.startsWith("member:")) {
    return "members";
  }
  if (node.id.startsWith("object:")) {
    return "directGrants";
  }
  if (node.id.startsWith("owned:")) {
    return "ownedObjects";
  }
  if (node.id.startsWith("public:")) {
    return "publicGrants";
  }
  if (node.id.startsWith("defaults:")) {
    return "defaultPrivileges";
  }
  return null;
}

function filterAccessMapModel({
  edges,
  nodes,
  visibleFacets,
}: {
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
  visibleFacets: AccessMapFacetVisibility;
}): { edges: VisualizationEdge[]; nodes: VisualizationNode[] } {
  const visibleNodes = nodes.filter((node) => {
    const facet = accessMapFacetForNode(node);
    return facet === null || visibleFacets[facet];
  });
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  return {
    edges: edges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    ),
    nodes: visibleNodes,
  };
}

function AccessMapCanvasActions({
  direction,
  hiddenFacetCount,
  isExpanded,
  onCollapse,
  onExpand,
  onLoadFullMap,
  onToggleDirection,
  onToggleFacet,
  visibleFacets,
}: {
  direction: VisualizationDirection;
  hiddenFacetCount: number;
  isExpanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onLoadFullMap: () => void;
  onToggleDirection: () => void;
  onToggleFacet: (facet: AccessMapVisibleFacet, visible: boolean) => void;
  visibleFacets: AccessMapFacetVisibility;
}) {
  return (
    <div className="flex max-w-[min(82vw,720px)] flex-wrap gap-2">
      <Button
        onClick={onToggleDirection}
        size="sm"
        type="button"
        variant="outline"
      >
        Switch to {direction === "LR" ? "vertical" : "horizontal"}
      </Button>
      <Button onClick={onLoadFullMap} size="sm" type="button" variant="outline">
        Load full map
      </Button>
      <Popover>
        <PopoverTrigger
          render={
            <Button size="sm" type="button" variant="outline">
              <SlidersHorizontal className="size-3.5" />
              Resource filters
              {hiddenFacetCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground"
                >
                  {hiddenFacetCount}
                </span>
              ) : null}
            </Button>
          }
        />
        <PopoverContent
          align="end"
          className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-3"
        >
          <PopoverHeader>
            <PopoverTitle>Access filters</PopoverTitle>
            <PopoverDescription>
              Add or remove access facets from this role map.
            </PopoverDescription>
          </PopoverHeader>
          <div className="grid gap-2">
            {ACCESS_MAP_FACET_FILTERS.map((filter) => {
              const switchId = `access-map-filter-${filter.kind}`;
              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card/80 p-2"
                  key={filter.kind}
                >
                  <div className="min-w-0">
                    <Label htmlFor={switchId}>{filter.label}</Label>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      {filter.description}
                    </p>
                  </div>
                  <Switch
                    checked={visibleFacets[filter.kind]}
                    id={switchId}
                    onCheckedChange={(checked) =>
                      onToggleFacet(filter.kind, checked)
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
        aria-label={isExpanded ? "Collapse access map" : "Expand access map"}
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

function RoleAccessMapTab(props: RoleDetailViewProps) {
  const navigate = useNavigate({
    from: "/instances/$instanceId/roles/$roleId",
  });
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [visibleFacets, setVisibleFacets] = useState<AccessMapFacetVisibility>(
    DEFAULT_ACCESS_MAP_FACET_VISIBILITY
  );
  const { direction, roleSelectedNodeId, setDirection, setRoleSelectedNodeId } =
    useDatabaseVisualizationStore(
      useShallow((state) => ({
        direction: state.direction,
        roleSelectedNodeId: state.roleSelectedNodeId,
        setDirection: state.setDirection,
        setRoleSelectedNodeId: state.setRoleSelectedNodeId,
      }))
    );
  const model = buildAccessMapModel({
    databaseName: props.effectiveDb?.name ?? props.effectiveDbId ?? "database",
    defaultPrivileges: defaultPrivilegeRows(props),
    directGrants: directGrantRows(props),
    members: props.memberRows.map((member) => ({
      roleId: member.roleId,
      roleName: member.roleName,
    })),
    ownedObjects: ownedObjectRows(props),
    parentRoles: props.belongsTo.map((parent) => ({
      roleId: parent.roleId,
      roleName: parent.roleName,
    })),
    publicGrants: publicGrantRows(props),
    role: {
      attributes: {
        bypassesRls: Boolean(props.attributes?.bypassesRls),
        canLogin: Boolean(props.attributes?.canLogin),
        isSuperuser: Boolean(props.attributes?.isSuperuser),
      },
      roleId: parseResourceLeafId(props.role.name) || props.role.roleName,
      roleName: props.role.roleName,
    },
  });
  const visibleModel = filterAccessMapModel({
    edges: model.edges,
    nodes: model.nodes,
    visibleFacets,
  });
  const hiddenFacetCount = ACCESS_MAP_FACET_FILTERS.filter(
    (filter) => !visibleFacets[filter.kind]
  ).length;
  const canvasActions = (
    <AccessMapCanvasActions
      direction={direction}
      hiddenFacetCount={hiddenFacetCount}
      isExpanded={false}
      onCollapse={() => setIsMapExpanded(false)}
      onExpand={() => setIsMapExpanded(true)}
      onLoadFullMap={loadFullRolesMap}
      onToggleDirection={toggleDirection}
      onToggleFacet={setVisibleFacet}
      visibleFacets={visibleFacets}
    />
  );
  const expandedCanvasActions = (
    <AccessMapCanvasActions
      direction={direction}
      hiddenFacetCount={hiddenFacetCount}
      isExpanded={true}
      onCollapse={() => setIsMapExpanded(false)}
      onExpand={() => setIsMapExpanded(true)}
      onLoadFullMap={loadFullRolesMap}
      onToggleDirection={toggleDirection}
      onToggleFacet={setVisibleFacet}
      visibleFacets={visibleFacets}
    />
  );

  function setVisibleFacet(facet: AccessMapVisibleFacet, visible: boolean) {
    setVisibleFacets((current) => ({
      ...current,
      [facet]: visible,
    }));
  }

  function toggleDirection() {
    setDirection(direction === "LR" ? "TB" : "LR");
  }

  function loadFullRolesMap() {
    navigate({
      params: { instanceId: props.instanceId },
      search: { tab: "map" },
      to: "/instances/$instanceId/roles",
    });
  }

  function handleNavigate(navigation: VisualizationNavigation) {
    if (navigation.to === "role" && navigation.roleId) {
      navigate({
        params: { instanceId: props.instanceId, roleId: navigation.roleId },
        search: { tab: "access-map" },
        to: "/instances/$instanceId/roles/$roleId",
      });
      return;
    }
    if (navigation.to === "explorer" && props.effectiveDbId) {
      navigate({
        params: {
          databaseId: props.effectiveDbId,
          instanceId: props.instanceId,
        },
        search: {
          category: navigation.category,
          name: navigation.name,
          schema: navigation.schema,
        },
        to: "/instances/$instanceId/databases/$databaseId/explorer",
      });
    }
  }

  const loading =
    props.grantsPending ||
    Object.values(props.facetStates).some((state) => state === "loading");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-xl tracking-tight">Access map</h2>
            <Badge variant="secondary">
              {props.effectiveDb?.name ?? "No database"}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            Shows role membership, direct grants, owned objects, PUBLIC access,
            and default privileges in one canvas.
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ShieldCheck className="size-5 text-primary" />
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                Parents
              </p>
              <p className="font-semibold text-lg tabular-nums">
                {model.summary.parentRoleCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <KeyRound className="size-5 text-primary" />
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                Direct grants
              </p>
              <p className="font-semibold text-lg tabular-nums">
                {model.summary.directGrantCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <GitBranch className="size-5 text-primary" />
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                Owned objects
              </p>
              <p className="font-semibold text-lg tabular-nums">
                {model.summary.ownedObjectCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="size-5 text-primary" />
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wider">
                PUBLIC grants
              </p>
              <p className="font-semibold text-lg tabular-nums">
                {model.summary.publicGrantCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {props.grantsError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Access data failed to load</AlertTitle>
          <AlertDescription>{errorMessage(props.grantsError)}</AlertDescription>
        </Alert>
      ) : null}
      {loading ? (
        <Alert>
          <Loader2 className="size-4 animate-spin" />
          <AlertTitle>Loading access facets</AlertTitle>
          <AlertDescription>
            The map updates as grants and ownership data arrive.
          </AlertDescription>
        </Alert>
      ) : null}

      <Suspense fallback={<AccessMapLoadingCard />}>
        <FlowCanvas
          actionPanel={canvasActions}
          direction={direction}
          edges={visibleModel.edges}
          nodes={visibleModel.nodes}
          onNavigate={handleNavigate}
          onSelectNode={setRoleSelectedNodeId}
          selectedNodeId={roleSelectedNodeId}
        />
      </Suspense>
      <Dialog onOpenChange={setIsMapExpanded} open={isMapExpanded}>
        <DialogContent className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] p-4 sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Expanded access map</DialogTitle>
            <DialogDescription>
              Explore role membership, ownership, direct grants, PUBLIC grants,
              and default privileges with more room.
            </DialogDescription>
          </DialogHeader>
          <Suspense fallback={<AccessMapLoadingCard />}>
            <FlowCanvas
              actionPanel={expandedCanvasActions}
              className="min-h-0"
              direction={direction}
              edges={visibleModel.edges}
              nodes={visibleModel.nodes}
              onNavigate={handleNavigate}
              onSelectNode={setRoleSelectedNodeId}
              selectedNodeId={roleSelectedNodeId}
            />
          </Suspense>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { RoleAccessMapTab };
