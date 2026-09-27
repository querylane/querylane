import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { SqlCodeBlock } from "@/components/querylane-ui/sql-code-block";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// The rstest viewport is fixed at 1280x1000, so this checks the right-edge
// sheet at desktop width. The icon-only copy tooltip must align to the button
// end so it never spills past the SQL block.
test("keeps a SQL copy tooltip inside a right-edge sheet", async () => {
  await render(
    <ScreenshotFrame>
      <Sheet open={true}>
        <SheetContent className="w-[calc(100vw-1rem)] overflow-hidden p-4">
          <SheetTitle>Extension details</SheetTitle>
          <SqlCodeBlock sql="SELECT encode(digest('payload', 'sha256'), 'hex')" />
        </SheetContent>
      </Sheet>
    </ScreenshotFrame>
  );

  await page.getByRole("button", { name: "Copy SQL" }).hover();

  const tooltip = page.locator('[data-slot="tooltip-content"]');
  await expect.element(tooltip).toBeVisible();

  const sqlBlock = document.querySelector("pre");
  const tooltipContent = document.querySelector(
    '[data-slot="tooltip-content"]'
  );
  if (!(sqlBlock instanceof HTMLPreElement && tooltipContent)) {
    throw new Error("Expected SQL code block and copy tooltip");
  }

  expect(tooltipContent.getBoundingClientRect().right).toBeLessThanOrEqual(
    sqlBlock.getBoundingClientRect().right
  );
});
