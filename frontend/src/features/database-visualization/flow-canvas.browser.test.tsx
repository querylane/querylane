import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
import { FlowCanvas } from "./flow-canvas";
import type { VisualizationNode } from "./graph-model";

test("minimap preserves the card surface in both themes", async () => {
  const { container } = await render(
    <div className="h-96 w-full">
      <div
        className="rounded-lg border border-border bg-card"
        data-testid="theme-reference"
      />
      <FlowCanvas direction="LR" edges={[]} nodes={[]} />
    </div>
  );

  await expect.element(page.getByLabel("Canvas minimap")).toBeVisible();
  const surface = container.querySelector(".react-flow__minimap");
  const reference = container.querySelector('[data-testid="theme-reference"]');
  if (!(surface && reference)) {
    throw new Error("Minimap surface or theme reference is missing.");
  }
  const actual = getComputedStyle(surface);
  const expected = getComputedStyle(reference);

  expect(actual.backgroundColor).toBe(expected.backgroundColor);
  expect(actual.borderTopWidth).toBe(expected.borderTopWidth);
  expect(actual.borderTopColor).toBe(expected.borderTopColor);
  expect(actual.borderTopLeftRadius).toBe(expected.borderTopLeftRadius);
});

test.each([
  { density: "default", direction: "LR" },
  { density: "compact", direction: "LR" },
  { density: "default", direction: "TB" },
  { density: "compact", direction: "TB" },
] as const)(
  "$direction/$density layout preserves node selection and navigation",
  async ({ density, direction }) => {
    const onSelectNode = rs.fn();
    const onNavigate = rs.fn();
    const navigation = {
      category: "tables",
      name: "orders",
      schema: "public",
      to: "explorer",
    } as const;
    const nodes: VisualizationNode[] = [
      {
        data: { badges: [], lines: [], title: "app" },
        id: "database",
        kind: "database",
      },
      {
        data: {
          badges: [],
          lines: ["id integer", "created_at timestamp"],
          navigation,
          title: "orders",
        },
        id: "orders",
        kind: "table",
      },
    ];
    await render(
      <FlowCanvas
        density={density}
        direction={direction}
        edges={[
          {
            id: "owns-orders",
            label: "owns",
            source: "database",
            target: "orders",
          },
        ]}
        nodes={nodes}
        onNavigate={onNavigate}
        onSelectNode={onSelectNode}
        selectedNodeId="orders"
      />
    );

    await page
      .getByRole("group", { name: "app, database node", exact: true })
      .click();
    expect(onSelectNode).toHaveBeenLastCalledWith("database");
    expect(onNavigate).not.toHaveBeenCalled();

    await page
      .getByRole("group", { name: "orders, table node", exact: true })
      .click();
    expect(onSelectNode).toHaveBeenLastCalledWith("orders");
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(navigation);
  }
);
