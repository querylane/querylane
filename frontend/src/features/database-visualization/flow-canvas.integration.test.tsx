import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { cleanup, render } from "@testing-library/react";
import { FlowCanvas } from "@/features/database-visualization/flow-canvas";
import type {
  VisualizationEdge,
  VisualizationNode,
} from "@/features/database-visualization/graph-model";

interface CapturedFlowNode {
  data: { selected: boolean };
  id: string;
}

type CapturedControlsStyle = React.CSSProperties & {
  "--xy-controls-button-background-color"?: string | undefined;
  "--xy-controls-button-background-color-hover"?: string | undefined;
  "--xy-controls-button-border-color"?: string | undefined;
  "--xy-controls-button-color"?: string | undefined;
};

const {
  capturedControlsClassNames,
  capturedControlsStyles,
  capturedEdges,
  capturedNodes,
  fitViewMock,
} = rs.hoisted(
  (): {
    capturedControlsClassNames: (string | undefined)[];
    capturedControlsStyles: CapturedControlsStyle[];
    capturedEdges: unknown[];
    capturedNodes: CapturedFlowNode[];
    fitViewMock: ReturnType<typeof rs.fn>;
  } => ({
    capturedControlsClassNames: [] as (string | undefined)[],
    capturedControlsStyles: [] as CapturedControlsStyle[],
    capturedEdges: [] as unknown[],
    capturedNodes: [],
    fitViewMock: rs.fn(),
  })
);

rs.mock("@xyflow/react", () => ({
  Background: MockBackground,
  Controls: MockControls,
  Handle: MockHandle,
  MarkerType: { ArrowClosed: "arrowclosed" },
  MiniMap: MockMiniMap,
  Panel: MockPanel,
  Position: { Bottom: "bottom", Left: "left", Right: "right", Top: "top" },
  ReactFlow: MockReactFlow,
  useReactFlow: () => ({ fitView: fitViewMock }),
}));

function node(
  id: string,
  kind: VisualizationNode["kind"] = "table",
  lines: string[] = []
): VisualizationNode {
  return {
    data: { badges: [], lines, title: id },
    id,
    kind,
  };
}

function orderingFixture() {
  const nodes = [
    node("root-zero", "schema"),
    node("root-one", "database", ["one", "two"]),
    node("disconnected", "view"),
    node("multiple-parents"),
    node("view-child", "view", ["one"]),
    node("table-child"),
    node("cycle-table"),
    node("cycle-schema", "schema"),
    node(
      "leaf",
      "column",
      Array.from({ length: 10 }, (_, i) => `line ${i}`)
    ),
  ];
  const connections: [string, string][] = [
    ["root-one", "multiple-parents"],
    ["root-zero", "multiple-parents"],
    ["root-zero", "view-child"],
    ["root-zero", "table-child"],
    ["root-zero", "multiple-parents"],
    ["unknown", "disconnected"],
    ["unknown", "view-child"],
    ["cycle-table", "cycle-schema"],
    ["cycle-schema", "cycle-table"],
    ["multiple-parents", "leaf"],
    ["root-one", "unknown-target"],
  ];
  const edges: VisualizationEdge[] = connections.map(([source, target], i) => ({
    id: `ordering:${i}`,
    source,
    target,
  }));
  return { edges, nodes };
}

const positionCases: {
  density?: "compact" | "default" | undefined;
  direction: "LR" | "TB";
  expected: [string, number, number][];
  sourcePosition: string;
  targetPosition: string;
}[] = [
  {
    direction: "LR",
    expected: [
      ["root-zero", 0, -430],
      ["root-one", 0, -254],
      ["disconnected", 0, -34],
      ["cycle-schema", 0, 142],
      ["cycle-table", 0, 318],
      ["multiple-parents", 388, -243],
      ["table-child", 388, -67],
      ["view-child", 388, 109],
      ["leaf", 776, -144],
    ],
    sourcePosition: "right",
    targetPosition: "left",
  },
  {
    direction: "TB",
    expected: [
      ["root-zero", -778, 0],
      ["root-one", -454, 0],
      ["disconnected", -130, 0],
      ["cycle-schema", 194, 0],
      ["cycle-table", 518, 0],
      ["multiple-parents", -454, 284],
      ["table-child", -130, 284],
      ["view-child", 194, 284],
      ["leaf", -130, 546],
    ],
    sourcePosition: "bottom",
    targetPosition: "top",
  },
  {
    density: "compact",
    direction: "LR",
    expected: [
      ["root-zero", 0, -335],
      ["root-one", 0, -193],
      ["disconnected", 0, -19],
      ["cycle-schema", 0, 123],
      ["cycle-table", 0, 265],
      ["multiple-parents", 308, -185],
      ["table-child", 308, -43],
      ["view-child", 308, 99],
      ["leaf", 616, -51],
    ],
    sourcePosition: "right",
    targetPosition: "left",
  },
  {
    density: "compact",
    direction: "TB",
    expected: [
      ["root-zero", -584, 0],
      ["root-one", -336, 0],
      ["disconnected", -88, 0],
      ["cycle-schema", 160, 0],
      ["cycle-table", 408, 0],
      ["multiple-parents", -336, 234],
      ["table-child", -88, 234],
      ["view-child", 160, 234],
      ["leaf", -88, 452],
    ],
    sourcePosition: "bottom",
    targetPosition: "top",
  },
];

const firstNode = node("table:public.one");
const secondNode = node("table:public.two");
const tableEdge: VisualizationEdge = {
  description: "Table two in public",
  id: "table:public.one->table:public.two",
  source: firstNode.id,
  target: secondNode.id,
};

afterEach(() => {
  cleanup();
  capturedControlsClassNames.length = 0;
  capturedControlsStyles.length = 0;
  capturedEdges.length = 0;
  capturedNodes.length = 0;
  fitViewMock.mockClear();
});

describe("flow canvas", () => {
  test.each(positionCases)(
    "preserves literal $direction/$density ordering and positions for irregular graphs",
    ({ density, direction, expected, sourcePosition, targetPosition }) => {
      const { edges, nodes } = orderingFixture();
      render(
        <FlowCanvas
          density={density}
          direction={direction}
          edges={edges}
          nodes={nodes}
        />
      );

      expect(capturedNodes).toMatchObject(
        expected.map(([id, x, y]) => ({
          id,
          position: { x, y },
          sourcePosition,
          targetPosition,
        }))
      );
      expect(capturedEdges).toMatchObject(edges);
    }
  );
  test.each([64, 256])(
    "bounds edge reads for a cold %i-node fan-out layout",
    (nodeCount) => {
      const nodes = Array.from({ length: nodeCount }, (_, index) =>
        node(`cold:${nodeCount}:${index}`)
      );
      const [root] = nodes;
      if (!root) {
        throw new Error("The fan-out fixture needs a root.");
      }
      let targetReads = 0;
      const edges: VisualizationEdge[] = nodes
        .slice(1)
        .map((target, index) => ({
          id: `cold:${nodeCount}:edge:${index}`,
          source: root.id,
          get target() {
            targetReads += 1;
            return target.id;
          },
        }));

      const { rerender } = render(
        <FlowCanvas direction="LR" edges={edges} nodes={nodes} />
      );

      expect(capturedNodes).toHaveLength(nodeCount);
      expect(capturedEdges).toHaveLength(nodeCount - 1);
      // Ranking, ordering and edge conversion each get a bounded edge pass.
      expect(targetReads).toBeGreaterThan(0);
      expect(targetReads).toBeLessThanOrEqual(edges.length * 8);

      const coldReads = targetReads;
      rerender(
        <FlowCanvas
          direction="LR"
          edges={edges}
          nodes={nodes}
          selectedNodeId={root.id}
        />
      );
      expect(targetReads).toBe(coldReads);
      expect(capturedNodes.find((entry) => entry.id === root.id)).toMatchObject(
        {
          data: { selected: true },
        }
      );
    }
  );
  test("passes useful labels to React Flow nodes", () => {
    const nodeWithSubtitle: VisualizationNode = {
      ...firstNode,
      data: { ...firstNode.data, subtitle: "public schema" },
    };

    render(
      <FlowCanvas
        direction="LR"
        edges={[tableEdge]}
        nodes={[nodeWithSubtitle, secondNode]}
      />
    );

    expect(capturedNodes).toContainEqual(
      expect.objectContaining({
        ariaLabel: "table:public.one, public schema, table node",
        id: firstNode.id,
      })
    );
  });
});

function MockBackground() {
  return <div data-testid="flow-background" />;
}

function MockControls({
  className,
  style,
}: {
  className?: string | undefined;
  style?: CapturedControlsStyle | undefined;
}) {
  capturedControlsClassNames.push(className);
  if (style) {
    capturedControlsStyles.push(style);
  }
  return <div data-testid="flow-controls" />;
}

function MockHandle() {
  return null;
}

function MockMiniMap() {
  return <div aria-label="Canvas minimap" role="img" />;
}

function MockPanel({
  children,
}: {
  children: React.ReactNode;
  className?: string | undefined;
  position?: string | undefined;
}) {
  return <div data-testid="flow-panel">{children}</div>;
}

function MockReactFlow({
  children,
  edges,
  minZoom,
  nodes,
}: {
  children: React.ReactNode;
  edges: unknown[];
  minZoom?: number | undefined;
  nodes: CapturedFlowNode[];
}) {
  capturedEdges.splice(0, capturedEdges.length, ...edges);
  capturedNodes.splice(0, capturedNodes.length, ...nodes);
  return (
    <section
      aria-label="Flow mock"
      data-edge-count={edges.length}
      data-min-zoom={minZoom}
      data-node-count={nodes.length}
    >
      {children}
    </section>
  );
}
