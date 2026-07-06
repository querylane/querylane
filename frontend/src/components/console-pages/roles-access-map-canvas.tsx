"use client";

import {
  Database,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import type {
  RolesAccessMapEdge,
  RolesAccessMapModel,
  RolesAccessMapObjectNode,
  RolesAccessMapRoleNode,
} from "@/components/console-pages/roles-access-map-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { assertNever } from "@/lib/assert-never";
import { cn } from "@/lib/utils";

const CANVAS_WIDTH = 1120;
const ROLE_X = 36;
const OBJECT_X = 784;
const NODE_WIDTH = 316;
const NODE_HEIGHT = 56;
const ROW_GAP = 88;
const TOP_OFFSET = 72;
const MIN_CANVAS_HEIGHT = 560;
const ROLE_ANCHOR_X = ROLE_X + NODE_WIDTH;
const OBJECT_ANCHOR_X = OBJECT_X;
const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.25;
const ZOOM_STEP = 0.1;
const ZOOM_PERCENT_FACTOR = 100;

function nodeY(index: number): number {
  return TOP_OFFSET + index * ROW_GAP;
}

function canvasHeight(model: RolesAccessMapModel): number {
  return Math.max(
    MIN_CANVAS_HEIGHT,
    TOP_OFFSET +
      Math.max(model.roles.length, model.objects.length, 1) * ROW_GAP +
      NODE_HEIGHT
  );
}

function edgePath({
  objectIndex,
  roleIndex,
}: {
  objectIndex: number;
  roleIndex: number;
}): string {
  const startY = nodeY(roleIndex) + NODE_HEIGHT / 2;
  const endY = nodeY(objectIndex) + NODE_HEIGHT / 2;
  const middleX = (ROLE_ANCHOR_X + OBJECT_ANCHOR_X) / 2;
  return `M ${ROLE_ANCHOR_X} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${OBJECT_ANCHOR_X} ${endY}`;
}

function edgeToneClass(tone: RolesAccessMapEdge["tone"]): string {
  switch (tone) {
    case "direct":
      return "stroke-blue-500/80";
    case "owner":
      return "stroke-amber-500/80";
    case "public":
      return "stroke-red-500/75 [stroke-dasharray:8_8]";
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

function roleConnections(model: RolesAccessMapModel, nodeId: string) {
  return model.edges.filter((edge) => edge.source === nodeId);
}

function objectConnections(model: RolesAccessMapModel, nodeId: string) {
  return model.edges.filter((edge) => edge.target === nodeId);
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
      connections: roleConnections(model, selectedNodeId),
      description: role.subtitle,
      title: role.title,
    };
  }
  const object = objectById(model, selectedNodeId);
  if (object) {
    return {
      connections: objectConnections(model, selectedNodeId),
      description: object.subtitle,
      title: object.title,
    };
  }
  return null;
}

function connectionLabel(model: RolesAccessMapModel, edge: RolesAccessMapEdge) {
  const role = roleById(model, edge.source);
  const object = objectById(model, edge.target);
  return `${role?.title ?? "Role"} → ${object?.title ?? "Object"} · ${edge.privileges.join(", ")}`;
}

function RoleNodeButton({
  node,
  onSelect,
  selected,
  top,
}: {
  node: RolesAccessMapRoleNode;
  onSelect: (nodeId: string) => void;
  selected: boolean;
  top: number;
}) {
  return (
    <Button
      aria-label={`Trace access for ${node.title}`}
      className={cn(
        "absolute h-14 justify-start rounded-xl border bg-background px-4 text-left shadow-sm hover:bg-accent",
        selected && "ring-2 ring-primary"
      )}
      onClick={() => onSelect(node.id)}
      style={{ left: ROLE_X, top, width: NODE_WIDTH }}
      type="button"
      variant="ghost"
    >
      <span
        aria-hidden="true"
        className={cn("mr-3 size-2.5 rounded-full", roleDotClass(node.kind))}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono font-semibold text-sm">
          {node.title}
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {node.subtitle}
        </span>
      </span>
    </Button>
  );
}

function ObjectNodeButton({
  node,
  onSelect,
  selected,
  top,
}: {
  node: RolesAccessMapObjectNode;
  onSelect: (nodeId: string) => void;
  selected: boolean;
  top: number;
}) {
  return (
    <Button
      aria-label={`Trace access to ${node.title}`}
      className={cn(
        "absolute h-14 justify-start rounded-xl border bg-background px-4 text-left shadow-sm hover:bg-accent",
        selected && "ring-2 ring-primary"
      )}
      onClick={() => onSelect(node.id)}
      style={{ left: OBJECT_X, top, width: NODE_WIDTH }}
      type="button"
      variant="ghost"
    >
      <Database
        aria-hidden="true"
        className="mr-3 size-4 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0">
        <span className="block truncate font-mono font-semibold text-sm">
          {node.title}
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {node.subtitle}
        </span>
      </span>
    </Button>
  );
}

function EmptyObjects() {
  return (
    <div className="absolute right-9 flex h-56 w-[316px] items-center justify-center rounded-xl border border-dashed bg-background/70 text-center text-muted-foreground text-sm">
      No object grants found for the visible roles.
    </div>
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
  const height = canvasHeight(model);
  const roleIndexById = new Map(
    model.roles.map((node, index) => [node.id, index])
  );
  const objectIndexById = new Map(
    model.objects.map((node, index) => [node.id, index])
  );

  function zoomOut() {
    setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
  }

  function zoomIn() {
    setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));
  }

  function resetZoom() {
    setZoom(DEFAULT_ZOOM);
  }

  return (
    <section aria-label="Role access map" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline">
          <SlidersHorizontal className="size-4" />
          View
        </Button>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
          <fieldset className="flex items-center rounded-lg border bg-background shadow-sm">
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
            <span className="min-w-14 text-center font-mono text-xs tabular-nums">
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
            <Button onClick={resetZoom} size="sm" type="button" variant="ghost">
              Fit
            </Button>
            <Button
              aria-label="Reset access trace"
              onClick={() => onSelectNode(null)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <RotateCcw className="size-4" />
            </Button>
          </fieldset>
          <span>
            Click a node to trace its access · details open in the drawer
          </span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-muted/30 p-4">
        <div
          className="relative origin-top-left"
          style={{
            height,
            transform: `scale(${zoom})`,
            width: CANVAS_WIDTH,
          }}
        >
          <div className="absolute top-0 left-9 font-semibold text-muted-foreground text-xs uppercase tracking-[0.2em]">
            Roles
          </div>
          <div className="absolute top-0 right-9 font-semibold text-muted-foreground text-xs uppercase tracking-[0.2em]">
            Objects
          </div>
          <svg
            aria-hidden="true"
            className="absolute inset-0"
            height={height}
            viewBox={`0 0 ${CANVAS_WIDTH} ${height}`}
            width={CANVAS_WIDTH}
          >
            {model.edges.map((edge) => {
              const roleIndex = roleIndexById.get(edge.source);
              const objectIndex = objectIndexById.get(edge.target);
              if (roleIndex == null || objectIndex == null) {
                return null;
              }
              const active = edgeIsActive({ edge, selectedNodeId });
              return (
                <path
                  className={cn(
                    "fill-none stroke-2 transition-opacity",
                    edgeToneClass(edge.tone),
                    active ? "opacity-90" : "opacity-15"
                  )}
                  d={edgePath({ objectIndex, roleIndex })}
                  key={edge.id}
                />
              );
            })}
          </svg>
          {model.roles.map((node, index) => (
            <RoleNodeButton
              key={node.id}
              node={node}
              onSelect={onSelectNode}
              selected={selectedNodeId === node.id}
              top={nodeY(index)}
            />
          ))}
          {model.objects.length === 0 ? <EmptyObjects /> : null}
          {model.objects.map((node, index) => (
            <ObjectNodeButton
              key={node.id}
              node={node}
              onSelect={onSelectNode}
              selected={selectedNodeId === node.id}
              top={nodeY(index)}
            />
          ))}
        </div>
      </div>
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
