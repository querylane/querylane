import { page } from "@rstest/browser";
import { expect, test } from "@rstest/core";
import { render } from "@/__tests__/render-ui";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";

test("shows the full value when truncated text is hovered", async () => {
  const value = "A deliberately long value that cannot fit";
  await render(
    <div className="w-24">
      <OverflowTooltip className="block truncate">{value}</OverflowTooltip>
    </div>
  );

  const trigger = page
    .locator('[data-querylane-slot="tooltip-trigger"]')
    .filter({ hasText: value });
  await expect.element(trigger).toBeVisible();
  await trigger.hover();
  await expect.element(page.getByRole("tooltip")).toBeVisible();
  await expect
    .element(page.getByRole("tooltip").getByText(value))
    .toBeVisible();
});
