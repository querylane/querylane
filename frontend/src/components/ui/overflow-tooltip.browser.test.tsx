import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";

test("shows the full value when truncated text is hovered", async () => {
  const value = "A deliberately long value that cannot fit";
  render(
    <TooltipProvider>
      <div className="w-24">
        <OverflowTooltip className="block truncate">{value}</OverflowTooltip>
      </div>
    </TooltipProvider>
  );

  const text = page.getByText(value);
  await expect.element(text).toBeVisible();
  const tooltipTrigger = text
    .element()
    .closest('[data-slot="tooltip-trigger"]');
  if (!(tooltipTrigger instanceof HTMLElement)) {
    throw new Error("Expected overflow tooltip trigger");
  }
  await text.hover();

  await expect.poll(() => page.getByText(value).elements().length).toBe(2);
  const tooltipContent = page
    .getByText(value)
    .elements()
    .find((element) => element.closest('[data-slot="tooltip-content"]'));
  if (!(tooltipContent instanceof HTMLElement)) {
    throw new Error("Expected overflow tooltip content");
  }
  await expect.element(page.elementLocator(tooltipContent)).toBeVisible();
});
