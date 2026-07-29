import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";

afterEach(async () => {
  await cleanup();
});

test("keeps a SQL copy tooltip inside a right-edge sheet", async () => {
  await page.viewport(320, 900);

  try {
    render(
      <ScreenshotFrame>
        <Sheet open={true}>
          <SheetContent className="w-[calc(100vw-1rem)] overflow-hidden p-4">
            <SheetTitle>Extension details</SheetTitle>
            <SqlCodeBlock sql="SELECT encode(digest('payload', 'sha256'), 'hex')" />
          </SheetContent>
        </Sheet>
      </ScreenshotFrame>
    );

    const copyButton = page.getByRole("button", { name: "Copy SQL" });
    await copyButton.hover();

    const tooltip = page.getByText("Copy SQL").last();
    await expect.element(tooltip).toBeVisible();

    const sqlBlock = document.querySelector("pre");
    if (!(sqlBlock instanceof HTMLPreElement)) {
      throw new Error("Expected SQL code block");
    }

    const sqlBlockRect = sqlBlock.getBoundingClientRect();
    const tooltipRect = tooltip.element().getBoundingClientRect();
    expect(tooltipRect.right).toBeLessThanOrEqual(sqlBlockRect.right);
  } finally {
    await page.viewport(1280, 1000);
  }
});
