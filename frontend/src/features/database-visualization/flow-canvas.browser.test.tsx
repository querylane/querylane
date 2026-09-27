import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { FlowCanvas } from "./flow-canvas";

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
