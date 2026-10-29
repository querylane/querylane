import { afterEach, describe, expect, rs, test } from "@rstest/core";
import { cleanup, render } from "@testing-library/react";
import { FlowCanvas } from "@/features/database-visualization/flow-canvas";
import type {
  VisualizationEdge,
  VisualizationNode,
} from "@/features/database-visualization/graph-model";

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
    capturedNodes: unknown[];
    fitViewMock: ReturnType<typeof rs.fn>;
  } => ({
    capturedControlsClassNames: [] as (string | undefined)[],
    capturedControlsStyles: [] as CapturedControlsStyle[],
    capturedEdges: [] as unknown[],
    capturedNodes: [] as unknown[],
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
  Position: { Left: "left", Right: "right" },
  ReactFlow: MockReactFlow,
  useReactFlow: () => ({ fitView: fitViewMock }),
}));

function node(id: string): VisualizationNode {
  return {
    data: { badges: [], lines: [], title: id },
    id,
    kind: "table",
  };
}

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
  nodes: unknown[];
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
