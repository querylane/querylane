import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";

test("shows the full value when truncated text is hovered", async () => {
  const value = "A deliberately long value that cannot fit";
  await render(
    <TooltipProvider>
      <div className="w-24">
        <OverflowTooltip className="block truncate">{value}</OverflowTooltip>
      </div>
    </TooltipProvider>
  );

  const text = page.getByText(value);
  await expect.element(text).toBeVisible();
  const trigger = page
    .locator('[data-slot="tooltip-trigger"]')
    .filter({ hasText: value });
  await expect.element(trigger).toHaveCount(1);
  await text.hover();

  await expect.element(text).toHaveCount(2);
  await expect
    .element(
      page.locator('[data-slot="tooltip-content"]').filter({ hasText: value })
    )
    .toBeVisible();
});
