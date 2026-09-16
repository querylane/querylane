import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FlowCanvas } from "./flow-canvas";

test("minimap preserves the card surface in both themes", async () => {
  await render(
    <div className="h-96 w-full">
      <div
        className="rounded-lg border border-border bg-card"
        data-testid="theme-reference"
      />
      <FlowCanvas direction="LR" edges={[]} nodes={[]} />
    </div>
  );

  const minimap = page.getByLabelText("Canvas minimap");
  await expect.element(minimap).toBeVisible();
  const surface = minimap.element().closest(".react-flow__minimap");
  if (!surface) {
    throw new Error("Minimap surface is missing.");
  }
  const actual = getComputedStyle(surface);
  const expected = getComputedStyle(
    page.getByTestId("theme-reference").element()
  );

  expect(actual.backgroundColor).toBe(expected.backgroundColor);
  expect(actual.borderTopWidth).toBe(expected.borderTopWidth);
  expect(actual.borderTopColor).toBe(expected.borderTopColor);
  expect(actual.borderTopLeftRadius).toBe(expected.borderTopLeftRadius);
});
