import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Button } from "@/components/ui/button";
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
  fitViewMock,
} = vi.hoisted(() => ({
  capturedControlsClassNames: [] as (string | undefined)[],
  capturedControlsStyles: [] as CapturedControlsStyle[],
  capturedEdges: [] as unknown[],
  fitViewMock: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  ["Background"]: () => <div data-testid="flow-background" />,
  ["Controls"]: ({
    className,
    style,
  }: {
    className?: string | undefined;
    style?: CapturedControlsStyle | undefined;
  }) => {
    capturedControlsClassNames.push(className);
    if (style) {
      capturedControlsStyles.push(style);
    }
    return <div data-testid="flow-controls" />;
  },
  ["Handle"]: () => null,
  ["MarkerType"]: { ["ArrowClosed"]: "arrowclosed" },
  ["MiniMap"]: () => <div aria-label="Canvas minimap" role="img" />,
  ["Panel"]: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string | undefined;
    position?: string | undefined;
  }) => <div data-testid="flow-panel">{children}</div>,
  ["Position"]: { ["Left"]: "left", ["Right"]: "right" },
  ["ReactFlow"]: ({
    children,
    edges,
    minZoom,
    nodes,
  }: {
    children: React.ReactNode;
    edges: unknown[];
    minZoom?: number | undefined;
    nodes: unknown[];
  }) => {
    capturedEdges.splice(0, capturedEdges.length, ...edges);
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
  },
  ["useReactFlow"]: () => ({ fitView: fitViewMock }),
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
  fitViewMock.mockClear();
});

describe("FlowCanvas", () => {
  test("fits the view again when graph contents change", async () => {
    const { rerender } = render(
      <FlowCanvas direction="LR" edges={[]} nodes={[firstNode]} />
    );

    await waitFor(() => {
      expect(fitViewMock).toHaveBeenCalled();
    });
    fitViewMock.mockClear();

    rerender(
      <FlowCanvas
        direction="LR"
        edges={[tableEdge]}
        nodes={[firstNode, secondNode]}
      />
    );

    await waitFor(() => {
      expect(fitViewMock).toHaveBeenCalled();
    });
    expect(
      screen.getByLabelText("Flow mock").getAttribute("data-node-count")
    ).toBe("2");
  });

  test("allows dense maps to zoom out far enough to fit", () => {
    render(
      <FlowCanvas
        density="compact"
        direction="LR"
        edges={[tableEdge]}
        nodes={[firstNode, secondNode]}
      />
    );

    const minZoom = screen
      .getByLabelText("Flow mock")
      .getAttribute("data-min-zoom");

    expect(minZoom).not.toBeNull();
    expect(Number(minZoom)).toBeLessThan(0.1);
  });

  test("uses orthogonal step edges so dense relationship lines cross at right angles", () => {
    render(
      <FlowCanvas
        density="compact"
        direction="LR"
        edges={[tableEdge]}
        nodes={[firstNode, secondNode]}
      />
    );

    expect(capturedEdges).toContainEqual(
      expect.objectContaining({
        id: tableEdge.id,
        type: "step",
      })
    );
  });

  test("renders custom canvas actions inside a React Flow panel", () => {
    render(
      <FlowCanvas
        actionPanel={<Button type="button">Map actions</Button>}
        direction="LR"
        edges={[]}
        nodes={[firstNode]}
      />
    );

    expect(screen.getByTestId("flow-panel")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Map actions" })).toBeTruthy();
  });

  test("renders a minimap for large-canvas orientation", () => {
    render(<FlowCanvas direction="LR" edges={[]} nodes={[firstNode]} />);

    expect(screen.getByLabelText("Canvas minimap")).toBeTruthy();
  });

  test("applies app theme classes to React Flow controls for dark mode contrast", () => {
    render(<FlowCanvas direction="LR" edges={[]} nodes={[firstNode]} />);

    expect(capturedControlsClassNames.at(-1)).toContain("text-foreground");
    expect(
      capturedControlsStyles.at(-1)?.["--xy-controls-button-background-color"]
    ).toBe("var(--card)");
    expect(capturedControlsStyles.at(-1)?.["--xy-controls-button-color"]).toBe(
      "var(--foreground)"
    );
  });
});
