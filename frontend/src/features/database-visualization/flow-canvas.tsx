"use client";

import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ExternalLink } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import type { VisualizationDirection } from "@/features/database-visualization/database-visualization-store";
import type {
  VisualizationEdge,
  VisualizationNavigation,
  VisualizationNode,
  VisualizationNodeData,
} from "@/features/database-visualization/graph-model";
import { cn } from "@/lib/utils";

const MAX_LAYOUT_CACHE_ENTRIES = 100;

type FlowCanvasDensity = "compact" | "default";
type ReactFlowControlsStyle = CSSProperties & {
  "--xy-controls-button-background-color": string;
  "--xy-controls-button-background-color-hover": string;
  "--xy-controls-button-border-color": string;
  "--xy-controls-button-color": string;
  "--xy-controls-button-color-hover": string;
};

interface FlowCanvasProps {
  actionPanel?: ReactNode | undefined;
  className?: string | undefined;
  density?: FlowCanvasDensity | undefined;
  direction: VisualizationDirection;
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
  onNavigate?: (navigation: VisualizationNavigation) => void;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null | undefined;
}

interface FlowNodeData extends Record<string, unknown>, VisualizationNodeData {
  density: FlowCanvasDensity;
  direction: VisualizationDirection;
  kind: VisualizationNode["kind"];
  selected: boolean;
}

type FlowNode = Node<FlowNodeData, "visualization">;

interface PositionedVisualizationNode {
  node: VisualizationNode;
  position: { x: number; y: number };
}

interface GraphLayout {
  flowEdges: Edge[];
  positionedNodes: PositionedVisualizationNode[];
}

interface RankGraph {
  incomingCounts: Map<string, number>;
  outgoing: Map<string, string[]>;
  ranks: Map<string, number>;
}

const layoutIdentityCache = new WeakMap<object, string>();
const graphLayoutCache = new Map<string, GraphLayout>();
let nextLayoutIdentity = 0;

const EDGE_LABEL_BACKGROUND_OPACITY = 0.92;
const EDGE_LABEL_BORDER_RADIUS = 6;
const EDGE_LABEL_FONT_SIZE = 11;
const EDGE_LABEL_PADDING_X = 6;
const EDGE_LABEL_PADDING_Y = 3;
const EDGE_LABEL_PADDING: [number, number] = [
  EDGE_LABEL_PADDING_X,
  EDGE_LABEL_PADDING_Y,
];
const FIT_VIEW_DURATION_MS = 180;
const FIT_VIEW_PADDING = 0.18;
const FIRST_RANK = 0;
const FLOW_MIN_ZOOM = {
  compact: 0.04,
  default: 0.08,
} satisfies Record<FlowCanvasDensity, number>;
const REACT_FLOW_MINIMAP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
} satisfies CSSProperties;

const REACT_FLOW_CONTROLS_STYLE = {
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-background-color-hover": "var(--accent)",
  "--xy-controls-button-border-color": "var(--border)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-color-hover": "var(--accent-foreground)",
  backgroundColor: "var(--card)",
  color: "var(--foreground)",
} satisfies ReactFlowControlsStyle;

const FLOW_DIMENSIONS = {
  compact: {
    baseNodeHeight: 70,
    lineHeight: 16,
    maxVisibleLines: 2,
    nodesep: 72,
    nodeWidth: 176,
    ranksep: 132,
  },
  default: {
    baseNodeHeight: 112,
    lineHeight: 22,
    maxVisibleLines: 8,
    nodesep: 64,
    nodeWidth: 260,
    ranksep: 128,
  },
} satisfies Record<
  FlowCanvasDensity,
  {
    baseNodeHeight: number;
    lineHeight: number;
    maxVisibleLines: number;
    nodeWidth: number;
    nodesep: number;
    ranksep: number;
  }
>;

const NODE_KIND_CLASS = {
  capability: "border-red-500/35 bg-red-500/5",
  column: "border-indigo-500/35 bg-indigo-500/5",
  constraint: "border-amber-500/35 bg-amber-500/5",
  database: "border-primary/40 bg-primary/5",
  default: "border-amber-500/35 bg-amber-500/5",
  index: "border-lime-500/35 bg-lime-500/5",
  key: "border-orange-500/35 bg-orange-500/5",
  object: "border-slate-500/35",
  policy: "border-red-500/35 bg-red-500/5",
  public: "border-sky-500/35 bg-sky-500/5",
  role: "border-violet-500/35 bg-violet-500/5",
  schema: "border-blue-500/35 bg-blue-500/5",
  table: "border-emerald-500/35 bg-emerald-500/5",
  trigger: "border-fuchsia-500/35 bg-fuchsia-500/5",
  view: "border-cyan-500/35 bg-cyan-500/5",
} satisfies Record<VisualizationNode["kind"], string>;

const NODE_KIND_LAYOUT_ORDER = {
  capability: 14,
  column: 7,
  constraint: 9,
  database: 0,
  default: 13,
  index: 10,
  key: 8,
  object: 5,
  policy: 11,
  public: 6,
  role: 2,
  schema: 1,
  table: 3,
  trigger: 12,
  view: 4,
} satisfies Record<VisualizationNode["kind"], number>;

function flowSourcePosition(direction: VisualizationDirection): Position {
  return direction === "LR" ? Position.Right : Position.Bottom;
}

function flowTargetPosition(direction: VisualizationDirection): Position {
  return direction === "LR" ? Position.Left : Position.Top;
}

function layoutIdentityKey(value: object): string {
  const cached = layoutIdentityCache.get(value);
  if (cached) {
    return cached;
  }
  nextLayoutIdentity += 1;
  const nextKey = String(nextLayoutIdentity);
  layoutIdentityCache.set(value, nextKey);
  return nextKey;
}

function rememberGraphLayout(key: string, value: GraphLayout): GraphLayout {
  if (graphLayoutCache.size >= MAX_LAYOUT_CACHE_ENTRIES) {
    const oldestKey = graphLayoutCache.keys().next().value;
    if (oldestKey !== undefined) {
      graphLayoutCache.delete(oldestKey);
    }
  }
  graphLayoutCache.set(key, value);
  return value;
}

function flowDimensions(density: FlowCanvasDensity) {
  return FLOW_DIMENSIONS[density];
}

function nodeHeight(
  node: VisualizationNode,
  density: FlowCanvasDensity
): number {
  const dimensions = flowDimensions(density);
  return (
    dimensions.baseNodeHeight +
    Math.min(node.data.lines.length, dimensions.maxVisibleLines) *
      dimensions.lineHeight
  );
}

function flowNodeClass({
  density,
  kind,
  selected,
}: {
  density: FlowCanvasDensity;
  kind: VisualizationNode["kind"];
  selected: boolean;
}) {
  return cn(
    "border bg-card text-card-foreground shadow-sm transition-colors",
    density === "compact"
      ? "w-[176px] rounded-lg p-2"
      : "w-[260px] rounded-xl p-3",
    selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
    NODE_KIND_CLASS[kind]
  );
}

function VisualizationGraphNode({ data }: NodeProps<FlowNode>) {
  const { maxVisibleLines } = flowDimensions(data.density);
  const extraCount = Math.max(0, data.lines.length - maxVisibleLines);
  const visibleLines = data.lines.slice(0, maxVisibleLines);
  const sourcePosition = flowSourcePosition(data.direction);
  const targetPosition = flowTargetPosition(data.direction);
  return (
    <div
      className={flowNodeClass({
        density: data.density,
        kind: data.kind,
        selected: data.selected,
      })}
    >
      <Handle className="opacity-0" position={targetPosition} type="target" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {data.subtitle ? (
            <p
              className={cn(
                "truncate text-muted-foreground uppercase tracking-wider",
                data.density === "compact" ? "text-[10px]" : "text-[11px]"
              )}
            >
              {data.subtitle}
            </p>
          ) : null}
          <h3
            className={cn(
              "truncate font-mono font-semibold",
              data.density === "compact" ? "text-xs" : "text-sm"
            )}
            title={data.title}
          >
            {data.title}
          </h3>
        </div>
        {data.navigation ? (
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </div>
      {data.badges.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.badges.map((badge) => (
            <Badge
              className={cn(
                data.density === "compact"
                  ? "h-4 px-1 text-[9px]"
                  : "h-5 px-1.5 text-[10px]"
              )}
              key={badge}
              variant="secondary"
            >
              {badge}
            </Badge>
          ))}
        </div>
      ) : null}
      {visibleLines.length > 0 ? (
        <div className="mt-2 space-y-1">
          {visibleLines.map((line) => (
            <p
              className={cn(
                "truncate font-mono text-muted-foreground",
                data.density === "compact" ? "text-[10px]" : "text-[11px]"
              )}
              key={line}
              title={line}
            >
              {line}
            </p>
          ))}
          {extraCount > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {"+"}
              {extraCount}
              {" more"}
            </p>
          ) : null}
        </div>
      ) : null}
      <Handle className="opacity-0" position={sourcePosition} type="source" />
    </div>
  );
}

const NODE_TYPES = {
  visualization: VisualizationGraphNode,
};

function flowViewportKey({
  density,
  direction,
  edges,
  nodes,
}: {
  density: FlowCanvasDensity;
  direction: VisualizationDirection;
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
}) {
  return [
    density,
    direction,
    nodes.map((node) => node.id).join("|"),
    edges.map((edge) => edge.id).join("|"),
  ].join(":");
}

function AutoFitView() {
  const { fitView } = useReactFlow();
  useEffect(
    function fitGraphAfterLayoutChanges() {
      fitView({
        duration: FIT_VIEW_DURATION_MS,
        padding: FIT_VIEW_PADDING,
      });
    },
    [fitView]
  );
  return null;
}

function childRank(
  ranks: Map<string, number>,
  source: string,
  target: string
): number {
  return Math.max(
    ranks.get(target) ?? FIRST_RANK,
    (ranks.get(source) ?? 0) + 1
  );
}

function createRankGraph({
  edges,
  nodes,
}: {
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
}): RankGraph {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const incomingCounts = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const ranks = new Map<string, number>();

  for (const node of nodes) {
    incomingCounts.set(node.id, 0);
    outgoing.set(node.id, []);
    ranks.set(node.id, FIRST_RANK);
  }

  for (const edge of edges) {
    if (!(nodeIds.has(edge.source) && nodeIds.has(edge.target))) {
      continue;
    }
    outgoing.get(edge.source)?.push(edge.target);
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) ?? 0) + 1);
  }

  return { incomingCounts, outgoing, ranks };
}

function applyAcyclicRanks({
  incomingCounts,
  nodes,
  outgoing,
  ranks,
}: {
  incomingCounts: Map<string, number>;
  nodes: VisualizationNode[];
  outgoing: Map<string, string[]>;
  ranks: Map<string, number>;
}) {
  const queue: string[] = [];
  for (const node of nodes) {
    if ((incomingCounts.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
    }
  }

  for (const source of queue) {
    applyOutgoingRanks({ incomingCounts, outgoing, queue, ranks, source });
  }
}

function applyOutgoingRanks({
  incomingCounts,
  outgoing,
  queue,
  ranks,
  source,
}: {
  incomingCounts: Map<string, number>;
  outgoing: Map<string, string[]>;
  queue: string[];
  ranks: Map<string, number>;
  source: string;
}) {
  for (const target of outgoing.get(source) ?? []) {
    ranks.set(target, childRank(ranks, source, target));
    incomingCounts.set(target, (incomingCounts.get(target) ?? 1) - 1);
    if ((incomingCounts.get(target) ?? 0) === 0) {
      queue.push(target);
    }
  }
}

function computeNodeRanks({
  edges,
  nodes,
}: {
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
}): Map<string, number> {
  const graph = createRankGraph({ edges, nodes });
  applyAcyclicRanks({ ...graph, nodes });
  return graph.ranks;
}

function firstIncomingOrder({
  edges,
  nodeId,
  orderById,
}: {
  edges: VisualizationEdge[];
  nodeId: string;
  orderById: Map<string, number>;
}) {
  return edges
    .filter((edge) => edge.target === nodeId)
    .reduce(
      (minOrder, edge) =>
        Math.min(minOrder, orderById.get(edge.source) ?? minOrder),
      Number.POSITIVE_INFINITY
    );
}

function incomingSortOrder({
  edges,
  node,
  orderById,
}: {
  edges: VisualizationEdge[];
  node: VisualizationNode;
  orderById: Map<string, number>;
}) {
  const parentOrder = firstIncomingOrder({ edges, nodeId: node.id, orderById });
  return Number.isFinite(parentOrder)
    ? parentOrder
    : (orderById.get(node.id) ?? 0);
}

function positionRankNodes({
  density,
  direction,
  nodes,
  rankOffset,
}: {
  density: FlowCanvasDensity;
  direction: VisualizationDirection;
  nodes: VisualizationNode[];
  rankOffset: number;
}): PositionedVisualizationNode[] {
  const dimensions = flowDimensions(density);
  const crossAxisSpan =
    nodes.reduce(
      (span, node) =>
        span +
        (direction === "LR" ? nodeHeight(node, density) : dimensions.nodeWidth),
      0
    ) +
    Math.max(0, nodes.length - 1) * dimensions.nodesep;
  let crossAxisCursor = -crossAxisSpan / 2;

  return nodes.map((node) => {
    const height = nodeHeight(node, density);
    const crossAxisSize = direction === "LR" ? height : dimensions.nodeWidth;
    const position =
      direction === "LR"
        ? { x: rankOffset, y: crossAxisCursor }
        : { x: crossAxisCursor, y: rankOffset };
    crossAxisCursor += crossAxisSize + dimensions.nodesep;
    return { node, position };
  });
}

function rankAxisSize({
  density,
  direction,
  nodes,
}: {
  density: FlowCanvasDensity;
  direction: VisualizationDirection;
  nodes: VisualizationNode[];
}): number {
  const dimensions = flowDimensions(density);
  if (direction === "LR") {
    return dimensions.nodeWidth;
  }
  return nodes.reduce(
    (maxHeight, node) => Math.max(maxHeight, nodeHeight(node, density)),
    0
  );
}

function positionNodes({
  density,
  direction,
  edges,
  nodes,
}: {
  density: FlowCanvasDensity;
  direction: VisualizationDirection;
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
}): PositionedVisualizationNode[] {
  const dimensions = flowDimensions(density);
  const ranks = computeNodeRanks({ edges, nodes });
  const orderById = new Map(nodes.map((node, index) => [node.id, index]));
  const nodesByRank = new Map<number, VisualizationNode[]>();

  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? FIRST_RANK;
    nodesByRank.set(rank, [...(nodesByRank.get(rank) ?? []), node]);
  }

  const positionedNodes: PositionedVisualizationNode[] = [];
  let rankOffset = 0;
  for (const rank of [...nodesByRank.keys()].toSorted(
    (left, right) => left - right
  )) {
    const rankNodes = nodesByRank.get(rank) ?? [];
    rankNodes.sort((left, right) => {
      const leftParentOrder = incomingSortOrder({
        edges,
        node: left,
        orderById,
      });
      const rightParentOrder = incomingSortOrder({
        edges,
        node: right,
        orderById,
      });
      return (
        leftParentOrder - rightParentOrder ||
        NODE_KIND_LAYOUT_ORDER[left.kind] -
          NODE_KIND_LAYOUT_ORDER[right.kind] ||
        (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0)
      );
    });
    positionedNodes.push(
      ...positionRankNodes({ density, direction, nodes: rankNodes, rankOffset })
    );
    rankOffset +=
      rankAxisSize({ density, direction, nodes: rankNodes }) +
      dimensions.ranksep;
  }

  return positionedNodes;
}

function computeGraphLayout({
  direction,
  density,
  edges,
  nodes,
}: {
  density: FlowCanvasDensity;
  direction: VisualizationDirection;
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
}): GraphLayout {
  const cacheKey = `${density}:${direction}:${layoutIdentityKey(nodes)}:${layoutIdentityKey(edges)}`;
  const cached = graphLayoutCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const positionedNodes = positionNodes({ density, direction, edges, nodes });
  const flowEdges: Edge[] = edges.map((edge) => {
    const accessibleLabel = edge.description ?? edge.label;
    return {
      animated: edge.id.startsWith("fk:") || edge.label === "owns",
      data: { description: edge.description },
      id: edge.id,
      labelBgBorderRadius: EDGE_LABEL_BORDER_RADIUS,
      labelBgPadding: EDGE_LABEL_PADDING,
      labelBgStyle: {
        fill: "var(--background)",
        fillOpacity: EDGE_LABEL_BACKGROUND_OPACITY,
      },
      labelStyle: {
        fill: "var(--foreground)",
        fontSize: EDGE_LABEL_FONT_SIZE,
      },
      markerEnd: { type: MarkerType.ArrowClosed },
      source: edge.source,
      target: edge.target,
      type: "step",
      ...(accessibleLabel ? { ariaLabel: accessibleLabel } : {}),
      ...(edge.label ? { label: edge.label } : {}),
    };
  });
  return rememberGraphLayout(cacheKey, { flowEdges, positionedNodes });
}

function layoutGraph({
  direction,
  density,
  edges,
  nodes,
  selectedNodeId,
}: {
  density: FlowCanvasDensity;
  direction: VisualizationDirection;
  edges: VisualizationEdge[];
  nodes: VisualizationNode[];
  selectedNodeId: string | null | undefined;
}) {
  const { flowEdges, positionedNodes } = computeGraphLayout({
    density,
    direction,
    edges,
    nodes,
  });
  const flowNodes: FlowNode[] = positionedNodes.map(({ node, position }) => ({
    ariaLabel: flowNodeAriaLabel(node),
    data: {
      ...node.data,
      density,
      direction,
      kind: node.kind,
      selected: selectedNodeId === node.id,
    },
    id: node.id,
    position: { ...position },
    sourcePosition: flowSourcePosition(direction),
    targetPosition: flowTargetPosition(direction),
    type: "visualization",
  }));
  return { flowEdges, flowNodes };
}

function flowNodeAriaLabel(node: VisualizationNode): string {
  return [node.data.title, node.data.subtitle, `${node.kind} node`]
    .filter(Boolean)
    .join(", ");
}

function FlowCanvas({
  actionPanel,
  className,
  density = "default",
  direction,
  edges,
  nodes,
  onNavigate,
  onSelectNode,
  selectedNodeId,
}: FlowCanvasProps) {
  const viewportKey = flowViewportKey({ density, direction, edges, nodes });
  const { flowEdges, flowNodes } = layoutGraph({
    density,
    direction,
    edges,
    nodes,
    selectedNodeId,
  });

  function handleNodeClick(_: React.MouseEvent, node: FlowNode) {
    onSelectNode?.(node.id);
    if (node.data.navigation) {
      onNavigate?.(node.data.navigation);
    }
  }

  return (
    <div
      className={cn(
        "h-[min(72dvh,760px)] min-h-[520px] overflow-hidden rounded-xl border bg-background",
        className
      )}
    >
      <ReactFlow<FlowNode, Edge>
        edges={flowEdges}
        fitView={true}
        minZoom={FLOW_MIN_ZOOM[density]}
        nodes={flowNodes}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        proOptions={{ hideAttribution: true }}
      >
        <AutoFitView key={viewportKey} />
        {actionPanel ? (
          <Panel
            className="nodrag nopan rounded-lg border bg-popover/95 p-2 text-popover-foreground shadow-lg backdrop-blur supports-[backdrop-filter]:bg-popover/85"
            position="top-right"
          >
            {actionPanel}
          </Panel>
        ) : null}
        <Background />
        <MiniMap
          ariaLabel="Canvas minimap"
          className="overflow-hidden shadow-md"
          maskColor="color-mix(in oklab, var(--muted) 72%, transparent)"
          nodeColor="var(--primary)"
          nodeStrokeColor="var(--border)"
          pannable={true}
          position="bottom-left"
          style={REACT_FLOW_MINIMAP_STYLE}
          zoomable={true}
        />
        <Controls
          className="border border-border bg-card text-foreground shadow-md"
          style={REACT_FLOW_CONTROLS_STYLE}
        />
      </ReactFlow>
    </div>
  );
}

export { FlowCanvas };
