"use client";

import {
  Database,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { useRef, useState } from "react";
import type {
  RolesAccessMapEdge,
  RolesAccessMapEdgeTone,
  RolesAccessMapModel,
  RolesAccessMapObjectNode,
  RolesAccessMapRoleNode,
} from "@/components/console-pages/roles-access-map-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { assertNever } from "@/lib/assert-never";
import { cn } from "@/lib/utils";

const CANVAS_WIDTH = 920;
const CANVAS_BASE_HEIGHT = 588;
const ROLE_X = 30;
const OBJECT_X = 688;
const ROLE_NODE_WIDTH = 202;
const OBJECT_NODE_WIDTH = 202;
const ROLE_NODE_HEIGHT = 36;
const OBJECT_NODE_HEIGHT = 42;
const ROLE_ROW_GAP = 60;
const OBJECT_ROW_GAP = 76;
const ROLE_TOP = 34;
const OBJECT_TOP = 40;
const ROLE_ANCHOR_X = ROLE_X + ROLE_NODE_WIDTH;
const ROLE_MEMBER_CURVE_X = 300;
const OBJECT_CURVE_START_X = 420;
const OBJECT_CURVE_END_X = 500;
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.6;
const ZOOM_STEP = 0.15;
const ZOOM_PERCENT_FACTOR = 100;
const EDGE_ACTIVE_WIDTH = 2;
const EDGE_DEFAULT_WIDTH = 1.5;

const EDGE_FILTERS: {
  description: string;
  label: string;
  tone: RolesAccessMapEdgeTone;
}[] = [
  {
    description: "Role inheritance from pg_auth_members.",
    label: "Members",
    tone: "member",
  },
  {
    description: "Explicit object privileges.",
    label: "Direct grants",
    tone: "direct",
  },
  {
    description: "Objects owned by roles.",
    label: "Owned objects",
    tone: "owner",
  },
  {
    description: "Privileges granted to PUBLIC.",
    label: "Public grants",
    tone: "public",
  },
  {
    description: "Privileges for future objects.",
    label: "Default privileges",
    tone: "default",
  },
];

const DEFAULT_EDGE_VISIBILITY = {
  default: true,
  direct: true,
  member: true,
  owner: true,
  public: true,
} satisfies Record<RolesAccessMapEdgeTone, boolean>;

function roleY(index: number): number {
  return ROLE_TOP + index * ROLE_ROW_GAP;
}

function objectY(index: number): number {
  return OBJECT_TOP + index * OBJECT_ROW_GAP;
}

function canvasHeight(model: RolesAccessMapModel): number {
  return Math.max(
    CANVAS_BASE_HEIGHT,
    ROLE_TOP + model.roles.length * ROLE_ROW_GAP + ROLE_NODE_HEIGHT,
    OBJECT_TOP + model.objects.length * OBJECT_ROW_GAP + OBJECT_NODE_HEIGHT
  );
}

function edgePath({
  objectIndex,
  roleIndex,
  targetRoleIndex,
}: {
  objectIndex: number | null;
  roleIndex: number;
  targetRoleIndex: number | null;
}): string {
  const startY = roleY(roleIndex) + ROLE_NODE_HEIGHT / 2;
  if (targetRoleIndex != null) {
    const endY = roleY(targetRoleIndex) + ROLE_NODE_HEIGHT / 2;
    return `M ${ROLE_ANCHOR_X} ${startY} C ${ROLE_MEMBER_CURVE_X} ${startY}, ${ROLE_MEMBER_CURVE_X} ${endY}, ${ROLE_ANCHOR_X} ${endY}`;
  }
  if (objectIndex == null) {
    return "";
  }
  const endY = objectY(objectIndex) + OBJECT_NODE_HEIGHT / 2;
  return `M ${ROLE_ANCHOR_X} ${startY} C ${OBJECT_CURVE_START_X} ${startY}, ${OBJECT_CURVE_END_X} ${endY}, ${OBJECT_X} ${endY}`;
}

function edgeToneClass(tone: RolesAccessMapEdge["tone"]): string {
  switch (tone) {
    case "default":
      return "stroke-emerald-500/80 [stroke-dasharray:2_4]";
    case "direct":
      return "stroke-blue-500/80";
    case "member":
      return "stroke-muted-foreground/60";
    case "owner":
      return "stroke-amber-500/80";
    case "public":
      return "stroke-red-500/75 [stroke-dasharray:6_4]";
    default:
      return assertNever(tone);
  }
}

function roleDotClass(kind: RolesAccessMapRoleNode["kind"]): string {
  switch (kind) {
    case "super":
      return "bg-amber-400";
    case "login":
      return "bg-emerald-500";
    case "repl":
      return "bg-sky-500";
    case "group":
    case "builtin":
      return "bg-muted-foreground";
    case "public":
      return "bg-red-500";
    default:
      return assertNever(kind);
  }
}

function edgeIsActive({
  edge,
  selectedNodeId,
}: {
  edge: RolesAccessMapEdge;
  selectedNodeId: string | null;
}): boolean {
  return (
    selectedNodeId == null ||
    edge.source === selectedNodeId ||
    edge.target === selectedNodeId
  );
}

function nodeConnections(model: RolesAccessMapModel, nodeId: string) {
  return model.edges.filter(
    (edge) => edge.source === nodeId || edge.target === nodeId
  );
}

function roleById(model: RolesAccessMapModel, nodeId: string) {
  return model.roles.find((role) => role.id === nodeId);
}

function objectById(model: RolesAccessMapModel, nodeId: string) {
  return model.objects.find((object) => object.id === nodeId);
}

function nodeDetails(
  model: RolesAccessMapModel,
  selectedNodeId: string | null
) {
  if (selectedNodeId == null) {
    return null;
  }
  const role = roleById(model, selectedNodeId);
  if (role) {
    return {
      connections: nodeConnections(model, selectedNodeId),
      description: `${role.subtitle} access breakdown — from pg_auth_members, information_schema, pg_default_acl`,
      title: role.title,
    };
  }
  const object = objectById(model, selectedNodeId);
  if (object) {
    return {
      connections: nodeConnections(model, selectedNodeId),
      description: object.subtitle,
      title: object.title,
    };
  }
  return null;
}

function connectionLabel(model: RolesAccessMapModel, edge: RolesAccessMapEdge) {
  const role = roleById(model, edge.source);
  const targetRole = roleById(model, edge.target);
  const object = objectById(model, edge.target);
  return `${role?.title ?? "Role"} → ${targetRole?.title ?? object?.title ?? "Object"} · ${edge.privileges.join(" · ")}`;
}

function RoleNodeButton({
  dimmed,
  node,
  onSelect,
  selected,
  top,
}: {
  dimmed: boolean;
  node: RolesAccessMapRoleNode;
  onSelect: (nodeId: string) => void;
  selected: boolean;
  top: number;
}) {
  return (
    <Button
      aria-label={`Trace access for ${node.title}`}
      className={cn(
        "absolute h-9 justify-start rounded-lg border bg-background px-3 text-left shadow-xs hover:bg-accent",
        selected && "border-primary ring-2 ring-primary/30",
        dimmed && "opacity-30"
      )}
      onClick={() => onSelect(node.id)}
      style={{ left: ROLE_X, top, width: ROLE_NODE_WIDTH }}
      type="button"
      variant="ghost"
    >
      <span
        aria-hidden="true"
        className={cn("mr-2 size-2 rounded-full", roleDotClass(node.kind))}
      />
      <span className="min-w-0 flex-1 truncate font-mono font-semibold text-[11.5px]">
        {node.title}
      </span>
      <span className="ml-2 shrink-0 text-[9.5px] text-muted-foreground">
        {node.subtitle}
      </span>
    </Button>
  );
}

function ObjectNodeButton({
  dimmed,
  node,
  onSelect,
  selected,
  top,
}: {
  dimmed: boolean;
  node: RolesAccessMapObjectNode;
  onSelect: (nodeId: string) => void;
  selected: boolean;
  top: number;
}) {
  return (
    <Button
      aria-label={`Trace access to ${node.title}`}
      className={cn(
        "absolute h-[42px] justify-start rounded-lg border bg-background px-3 text-left shadow-xs hover:bg-accent",
        selected && "border-primary ring-2 ring-primary/30",
        dimmed && "opacity-30"
      )}
      onClick={() => onSelect(node.id)}
      style={{ left: OBJECT_X, top, width: OBJECT_NODE_WIDTH }}
      type="button"
      variant="ghost"
    >
      <Database
        aria-hidden="true"
        className="mr-2 size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0">
        <span className="block truncate font-mono font-semibold text-[11.5px] leading-tight">
          {node.title}
        </span>
        <span className="block truncate text-[9.5px] text-muted-foreground leading-tight">
          {node.subtitle}
        </span>
      </span>
    </Button>
  );
}

function EmptyObjects() {
  return (
    <div
      className="absolute flex h-36 items-center justify-center rounded-xl border border-dashed bg-background/70 text-center text-muted-foreground text-sm"
      style={{ left: OBJECT_X, top: OBJECT_TOP, width: OBJECT_NODE_WIDTH }}
    >
      No object grants found for the visible roles.
    </div>
  );
}

function AccessFiltersPopover({
  edgeVisibility,
  onToggle,
}: {
  edgeVisibility: Record<RolesAccessMapEdgeTone, boolean>;
  onToggle: (tone: RolesAccessMapEdgeTone, visible: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <SlidersHorizontal className="size-3.5" />
            View
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>Access filters</PopoverTitle>
        </PopoverHeader>
        <div className="grid gap-2">
          {EDGE_FILTERS.map((filter) => {
            const switchId = `role-access-map-${filter.tone}`;
            return (
              <div
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg p-2 hover:bg-muted"
                key={filter.tone}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-0 w-8 border-t-2",
                      edgeToneClass(filter.tone)
                    )}
                  />
                  <div className="min-w-0">
                    <Label className="text-xs" htmlFor={switchId}>
                      {filter.label}
                    </Label>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {filter.description}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={edgeVisibility[filter.tone]}
                  id={switchId}
                  onCheckedChange={(checked) => onToggle(filter.tone, checked)}
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SelectedNodeSheet({
  model,
  onOpenChange,
  selectedNodeId,
}: {
  model: RolesAccessMapModel;
  onOpenChange: (open: boolean) => void;
  selectedNodeId: string | null;
}) {
  const details = nodeDetails(model, selectedNodeId);
  return (
    <Sheet onOpenChange={onOpenChange} open={details != null}>
      <SheetContent className="w-[min(100vw,28rem)] sm:max-w-md">
        {details ? (
          <>
            <SheetHeader>
              <SheetTitle>{details.title}</SheetTitle>
              <SheetDescription>{details.description}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 px-4">
              <Badge className="w-fit" variant="secondary">
                {details.connections.length} connection
                {details.connections.length === 1 ? "" : "s"}
              </Badge>
              <div className="grid gap-2">
                {details.connections.map((edge) => (
                  <div
                    className="rounded-lg border bg-card p-3 text-card-foreground"
                    key={edge.id}
                  >
                    <p className="font-medium text-sm">
                      {connectionLabel(model, edge)}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {edge.tone}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function RolesAccessMapCanvas({
  model,
  onSelectNode,
  selectedNodeId,
}: {
  model: RolesAccessMapModel;
  onSelectNode: (nodeId: string | null) => void;
  selectedNodeId: string | null;
}) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [isExpanded, setIsExpanded] = useState(false);
  const [edgeVisibility, setEdgeVisibility] = useState(DEFAULT_EDGE_VISIBILITY);
  const viewportRef = useRef<HTMLDivElement>(null);
  const height = canvasHeight(model);
  const roleIndexById = new Map(
    model.roles.map((node, index) => [node.id, index])
  );
  const objectIndexById = new Map(
    model.objects.map((node, index) => [node.id, index])
  );
  const visibleEdges = model.edges.filter((edge) => edgeVisibility[edge.tone]);
  const adjacentNodeIds = new Set(
    selectedNodeId == null
      ? []
      : visibleEdges.flatMap((edge) =>
          edge.source === selectedNodeId || edge.target === selectedNodeId
            ? [edge.source, edge.target]
            : []
        )
  );

  function zoomOut() {
    setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
  }

  function zoomIn() {
    setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));
  }

  function fitZoom() {
    const viewportWidth = viewportRef.current?.clientWidth ?? 0;
    const viewportHeight = viewportRef.current?.clientHeight ?? 0;
    if (viewportWidth <= 0) {
      setZoom(DEFAULT_ZOOM);
      return;
    }
    const widthZoom = viewportWidth / CANVAS_WIDTH;
    const heightZoom = viewportHeight > 0 ? viewportHeight / height : MAX_ZOOM;
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, widthZoom, heightZoom)));
  }

  function toggleEdgeTone(tone: RolesAccessMapEdgeTone, visible: boolean) {
    setEdgeVisibility((current) => ({ ...current, [tone]: visible }));
  }

  function nodeIsDimmed(nodeId: string): boolean {
    return (
      selectedNodeId != null &&
      selectedNodeId !== nodeId &&
      !adjacentNodeIds.has(nodeId)
    );
  }

  const mapSurface = (
    <div
      className={cn(
        "grid gap-3",
        isExpanded && "min-h-0 grid-rows-[auto_minmax(0,1fr)]"
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <AccessFiltersPopover
          edgeVisibility={edgeVisibility}
          onToggle={toggleEdgeTone}
        />
        <div className="flex-1" />
        <fieldset className="flex items-center rounded-lg border bg-background p-0.5 shadow-sm">
          <legend className="sr-only">Role access map zoom controls</legend>
          <Button
            aria-label="Zoom out"
            onClick={zoomOut}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Minus className="size-4" />
          </Button>
          <span className="min-w-10 text-center font-mono text-[10.5px] text-muted-foreground tabular-nums">
            {Math.round(zoom * ZOOM_PERCENT_FACTOR)}%
          </span>
          <Button
            aria-label="Zoom in"
            onClick={zoomIn}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Plus className="size-4" />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button onClick={fitZoom} size="sm" type="button" variant="ghost">
            Fit
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            aria-label={
              isExpanded
                ? "Collapse role access map"
                : "Maximize role access map"
            }
            onClick={() => setIsExpanded((current) => !current)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {isExpanded ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </Button>
        </fieldset>
        <span className="text-[11.5px] text-muted-foreground">
          click a node to trace its access · details open in the drawer
        </span>
      </div>
      <div
        className="overflow-auto rounded-2xl border bg-card shadow-xs"
        ref={viewportRef}
      >
        <div
          className="overflow-hidden"
          style={{
            height: Math.round(height * zoom),
            width: Math.round(CANVAS_WIDTH * zoom),
          }}
        >
          <div
            className="relative origin-top-left"
            style={{
              height,
              transform: `scale(${zoom})`,
              width: CANVAS_WIDTH,
            }}
          >
            <div
              className="absolute top-2 font-semibold text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]"
              style={{ left: ROLE_X }}
            >
              Roles
            </div>
            <div
              className="absolute top-2 font-semibold text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]"
              style={{ left: OBJECT_X }}
            >
              Objects
            </div>
            <svg
              aria-hidden="true"
              className="absolute inset-0 overflow-visible"
              height={height}
              viewBox={`0 0 ${CANVAS_WIDTH} ${height}`}
              width={CANVAS_WIDTH}
            >
              {visibleEdges.map((edge) => {
                const roleIndex = roleIndexById.get(edge.source);
                const targetRoleIndex = roleIndexById.get(edge.target) ?? null;
                const objectIndex = objectIndexById.get(edge.target) ?? null;
                if (roleIndex == null) {
                  return null;
                }
                if (targetRoleIndex == null && objectIndex == null) {
                  return null;
                }
                const active = edgeIsActive({ edge, selectedNodeId });
                return (
                  <path
                    className={cn(
                      "fill-none transition-opacity",
                      edgeToneClass(edge.tone),
                      active ? "opacity-100" : "opacity-15"
                    )}
                    d={edgePath({ objectIndex, roleIndex, targetRoleIndex })}
                    key={edge.id}
                    strokeWidth={
                      active ? EDGE_ACTIVE_WIDTH : EDGE_DEFAULT_WIDTH
                    }
                  />
                );
              })}
            </svg>
            {model.roles.map((node, index) => (
              <RoleNodeButton
                dimmed={nodeIsDimmed(node.id)}
                key={node.id}
                node={node}
                onSelect={onSelectNode}
                selected={selectedNodeId === node.id}
                top={roleY(index)}
              />
            ))}
            {model.objects.length === 0 ? <EmptyObjects /> : null}
            {model.objects.map((node, index) => (
              <ObjectNodeButton
                dimmed={nodeIsDimmed(node.id)}
                key={node.id}
                node={node}
                onSelect={onSelectNode}
                selected={selectedNodeId === node.id}
                top={objectY(index)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <section aria-label="Role access map" className="grid gap-3">
      {isExpanded ? null : mapSurface}
      <Dialog onOpenChange={setIsExpanded} open={isExpanded}>
        <DialogContent className="!flex !max-w-[calc(100vw-2rem)] h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col gap-4 overflow-hidden p-4">
          <DialogHeader>
            <DialogTitle>Expanded role access map</DialogTitle>
            <DialogDescription>
              Trace role membership and object access with more room.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">{isExpanded ? mapSurface : null}</div>
        </DialogContent>
      </Dialog>
      <SelectedNodeSheet
        model={model}
        onOpenChange={(open) => {
          if (!open) {
            onSelectNode(null);
          }
        }}
        selectedNodeId={selectedNodeId}
      />
    </section>
  );
}

export { RolesAccessMapCanvas };
