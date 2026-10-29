import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/querylane-ui/button";
import {
  flattenPlan,
  type PlanMetric,
  type PlanNode,
  planMetricValue,
  planNodeInsights,
  planNodeTitle,
} from "@/features/query-plan/explain-plan-model";
import {
  formatCount,
  formatPlanMs,
} from "@/features/sql-workbench/sql-workbench-format";
import { cn } from "@/lib/utils";
import { isNonEmptyString } from "@/lib/value-guards";

const PERCENT = 100;
const MIN_FIT = 0.65;
const VIEW_PADDING = 16;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.15;
const HOT_SHARE = 0.5;
const CURVE = 28;
const ACTIVE_STROKE = 3;
const NODE_WIDTH = 176;
const NODE_HEIGHT = 100;
const COLUMN = 232;
const ROW = 142;
const PADDING = 32;

/** Leaves occupy distinct rows; parents sit between their inputs. X is depth, never time. */
function layoutPlan(root: PlanNode) {
  const positions: {
    node: PlanNode;
    depth: number;
    x: number;
    y: number;
  }[] = [];
  let leaves = 0;
  let maxDepth = 0;
  function visit(node: PlanNode, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    const childRows = node.children.map((child) => visit(child, depth + 1));
    const y =
      childRows.length > 0
        ? ((childRows[0] ?? 0) + (childRows.at(-1) ?? 0)) / 2
        : PADDING + leaves * ROW;
    if (childRows.length === 0) {
      leaves += 1;
    }
    positions.push({ node, depth, x: 0, y });
    return y;
  }
  visit(root, 0);
  for (const position of positions) {
    position.x = PADDING + (maxDepth - position.depth) * COLUMN;
  }
  return {
    positions,
    width: PADDING * 2 + maxDepth * COLUMN + NODE_WIDTH,
    height: PADDING * 2 + Math.max(0, leaves - 1) * ROW + NODE_HEIGHT,
  };
}

function metricLabel(node: PlanNode, metric: PlanMetric) {
  const value = planMetricValue(node, metric);
  if (value === undefined) {
    return "—";
  }
  return metric === "self" || metric === "time"
    ? formatPlanMs(value)
    : formatCount(value);
}

type MapPosition = ReturnType<typeof layoutPlan>["positions"][number];
function PlanEdge({
  parent,
  source,
  selectedId,
}: {
  parent: MapPosition;
  source: MapPosition;
  selectedId: string;
}) {
  const startX = source.x + NODE_WIDTH;
  const startY = source.y + NODE_HEIGHT / 2;
  const endY = parent.y + NODE_HEIGHT / 2;
  const selected =
    selectedId === source.node.id ||
    selectedId.startsWith(`${source.node.id}.`) ||
    selectedId === parent.node.id;
  return (
    <g>
      <path
        className={selected ? "stroke-chart-4/65" : "stroke-chart-2/30"}
        d={`M ${startX} ${startY} C ${startX + CURVE} ${startY}, ${parent.x - CURVE} ${endY}, ${parent.x} ${endY}`}
        fill="none"
        strokeWidth={selected ? ACTIVE_STROKE : 2}
      />
      <circle
        className={selected ? "fill-chart-4" : "fill-chart-2/50"}
        cx={parent.x}
        cy={endY}
        r="3"
      />
    </g>
  );
}
function nodeCaption(node: PlanNode) {
  if (isNonEmptyString(node.relationName)) {
    return node.nodeType;
  }
  return node.children.length === 1
    ? "1 input"
    : `${node.children.length} inputs`;
}
function nodeAnnotation(node: PlanNode) {
  if (node.actualLoops !== undefined && node.actualLoops > 1) {
    return `× ${formatCount(node.actualLoops)}`;
  }
  const rows = node.actualRows ?? node.planRows;
  return rows === undefined ? "— rows" : `${formatCount(rows)} rows`;
}
function MapNode({
  position: { node, x, y },
  metric,
  maximum,
  selectedId,
  onSelect,
}: {
  position: MapPosition;
  metric: PlanMetric;
  maximum: number;
  selectedId: string;
  onSelect: (node: PlanNode) => void;
}) {
  const value = planMetricValue(node, metric);
  const share = maximum > 0 ? (value ?? 0) / maximum : 0;
  const selected = node.id === selectedId;
  const findings = planNodeInsights(node);
  const annotation = nodeAnnotation(node);
  const caption = nodeCaption(node);
  return (
    <Button
      aria-description={`Inspect ${planNodeTitle(node)}`}
      aria-pressed={selected}
      className="absolute top-(--plan-y) left-(--plan-x) h-(--plan-height) w-(--plan-width)"
      data-plan-node={node.id}
      onClick={() => {
        onSelect(node);
      }}
      presentation="plan-map-node"
      style={{
        "--plan-x": `${x}px`,
        "--plan-y": `${y}px`,
        "--plan-width": `${NODE_WIDTH}px`,
        "--plan-height": `${NODE_HEIGHT}px`,
      }}
      type="button"
      variant="ghost"
    >
      <span className="text-muted-foreground flex items-center justify-between gap-2 px-3 pt-3 text-xs">
        <span>{caption}</span>
        {findings.length > 0 ? (
          <span
            className="bg-chart-4 size-1.5 rounded-full"
            title={findings.map((finding) => finding.label).join("; ")}
          />
        ) : null}
      </span>
      <span
        className="truncate px-3 pt-1 text-sm font-medium"
        title={planNodeTitle(node)}
      >
        {node.relationName ?? node.nodeType}
      </span>
      <span className="mt-auto flex items-baseline justify-between px-3 pb-2">
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            selected && "text-warning-700 dark:text-warning-400"
          )}
        >
          {metricLabel(node, metric)}
        </span>
        <span className="text-muted-foreground text-xs">{annotation}</span>
      </span>
      <span
        aria-hidden="true"
        className="bg-muted h-1 w-full overflow-hidden rounded-b-lg"
      >
        <span
          className={cn(
            "block h-full w-(--plan-share)",
            share >= HOT_SHARE ? "bg-chart-4" : "bg-chart-2/55"
          )}
          style={{ "--plan-share": `${share * PERCENT}%` }}
        />
      </span>
    </Button>
  );
}

function PlanMap({
  root,
  metric,
  selection,
  onSelect,
}: {
  root: PlanNode;
  metric: PlanMetric;
  selection: { id: string; inspect: boolean };
  onSelect: (node: PlanNode) => void;
}) {
  const selectedId = selection.id;
  const layout = layoutPlan(root);
  const viewportRef = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState({ width: 800, height: 400 });
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(function measureMap() {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setBounds({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const fittedScale = Math.min(
    1,
    Math.max(1, bounds.width - VIEW_PADDING) / layout.width,
    Math.max(1, bounds.height - VIEW_PADDING) / layout.height
  );
  const scale = zoom ?? Math.max(MIN_FIT, fittedScale);
  useEffect(
    function revealMapSelection() {
      viewportRef.current
        ?.querySelector(`[data-plan-node="${selection.id}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [selection]
  );
  const nodes = flattenPlan(root);
  const maximum = Math.max(
    0,
    ...nodes.map((node) => planMetricValue(node, metric) ?? 0)
  );
  return (
    <div className="bg-muted/15 relative flex min-h-64 min-w-0 flex-1 flex-col">
      <section
        aria-label="Plan map"
        className="min-h-56 flex-1 overflow-auto [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:20px_20px]"
        ref={viewportRef}
      >
        <div className="flex min-h-full w-max min-w-full items-center justify-center p-2">
          <div
            className="relative h-(--plan-height) w-(--plan-width) shrink-0"
            style={{
              "--plan-width": `${layout.width * scale}px`,
              "--plan-height": `${layout.height * scale}px`,
            }}
          >
            <div
              className="absolute top-0 left-0 h-(--plan-height) w-(--plan-width) origin-top-left scale-(--plan-zoom)"
              style={{
                "--plan-width": `${layout.width}px`,
                "--plan-height": `${layout.height}px`,
                "--plan-zoom": scale,
              }}
            >
              <svg
                aria-hidden="true"
                className="absolute inset-0"
                height={layout.height}
                width={layout.width}
              >
                {layout.positions.flatMap((parent) =>
                  parent.node.children.map((child) => {
                    const source = layout.positions.find(
                      (position) => position.node.id === child.id
                    );
                    return source ? (
                      <PlanEdge
                        key={child.id}
                        parent={parent}
                        selectedId={selectedId}
                        source={source}
                      />
                    ) : null;
                  })
                )}
              </svg>
              {layout.positions.map((position) => (
                <MapNode
                  key={position.node.id}
                  maximum={maximum}
                  metric={metric}
                  onSelect={onSelect}
                  position={position}
                  selectedId={selectedId}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
      <div className="bg-background text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs">
        <span>
          Inputs → output <span className="text-border mx-2">/</span> Structure,
          not a timeline
        </span>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Zoom out"
            disabled={scale <= MIN_ZOOM}
            onClick={() => {
              setZoom(Math.max(MIN_ZOOM, scale - ZOOM_STEP));
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <span aria-hidden="true">−</span>
          </Button>
          <span className="w-9 text-center tabular-nums">
            {Math.round(scale * PERCENT)}%
          </span>
          <Button
            aria-label="Zoom in"
            disabled={scale >= MAX_ZOOM}
            onClick={() => {
              setZoom(Math.min(MAX_ZOOM, scale + ZOOM_STEP));
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <span aria-hidden="true">+</span>
          </Button>
          <Button
            onClick={() => {
              setZoom(fittedScale);
            }}
            presentation="compact"
            size="xs"
            type="button"
            variant="ghost"
          >
            Fit
          </Button>
        </div>
      </div>
    </div>
  );
}

export { PlanMap };
