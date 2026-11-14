import { page } from "@rstest/browser";
import { act } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { getByRole } from "@testing-library/dom";
import { toast } from "@ui-sdk/react/toast";
import { useState } from "react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { render } from "@/__tests__/render-ui";
import { TextPreview } from "@/components/data-grid/table-data-grid/data-cell-text-preview";
import { DataGridPopoverContent } from "@/components/data-grid/table-data-grid/data-grid-popover-content";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/toast";

test("submenu opens with arrows and restores focus to its trigger", async () => {
  await render(
    <ScreenshotFrame>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button">Actions</Button>} />
        <DropdownMenuContent aria-label="Actions">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>More actions</DropdownMenuSubTrigger>
            <DropdownMenuSubContent aria-label="More actions">
              <DropdownMenuItem onClick={() => undefined}>
                Inspect
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </ScreenshotFrame>
  );
  await page.getByRole("button", { name: "Actions" }).press("Enter");
  const more = page.getByRole("menuitem", { name: "More actions" });
  await more.press("ArrowRight");
  const inspect = page.getByRole("menuitem", { name: "Inspect" });
  await expect.element(inspect).toBeFocused();
  await inspect.press("ArrowLeft");
  await expect.element(more).toBeFocused();
});

test("vertical resizable panels lay out vertically and respond to the keyboard", async () => {
  await render(
    <ScreenshotFrame>
      <div className="size-96">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize={50} minSize={20}>
            <section aria-label="Editor">Editor</section>
          </ResizablePanel>
          <ResizableHandle aria-label="Resize editor" withHandle={true} />
          <ResizablePanel defaultSize={50} minSize={20}>
            <section aria-label="Results">Results</section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ScreenshotFrame>
  );
  const editor = getByRole(document.body, "region", { name: "Editor" });
  const results = getByRole(document.body, "region", { name: "Results" });
  expect(results.getBoundingClientRect().top).toBeGreaterThan(
    editor.getBoundingClientRect().top
  );
  const handle = page.getByRole("separator", { name: "Resize editor" });
  const element = getByRole(document.body, "separator", {
    name: "Resize editor",
  });
  const initial = Number(element.getAttribute("aria-valuenow"));
  await handle.press("ArrowDown");
  await expect
    .poll(() => Number(element.getAttribute("aria-valuenow")))
    .toBeGreaterThan(initial);
});

test("notifications invoke their action and dismiss", async () => {
  let reported = false;
  await render(
    <ScreenshotFrame>
      <Toaster />
    </ScreenshotFrame>
  );
  await act(() => {
    toast.error("Connection failed", {
      description: "Try another server",
      action: {
        label: "Report issue",
        onAction: () => {
          reported = true;
        },
      },
    });
  });
  await expect
    .element(page.getByText("Connection failed", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Report issue" }).click();
  expect(reported).toBe(true);
  await act(() => {
    toast.dismiss();
  });
  await expect
    .element(page.getByText("Connection failed", { exact: true }))
    .toBeDetached();
});

function BoundedPopup() {
  const [boundary, setBoundary] = useState<HTMLDivElement | null>(null);
  return (
    <ScreenshotFrame>
      <div
        className="m-20 h-9 w-64 border"
        data-testid="popup-boundary"
        ref={setBoundary}
      >
        <Popover>
          <PopoverTrigger
            render={<Button type="button">Open bounded popup</Button>}
          />
          <DataGridPopoverContent
            aria-label="Bounded popup"
            collisionBoundary={boundary ?? undefined}
          >
            <Button onClick={() => undefined} type="button">
              Popup action
            </Button>
            <p>A popup that starts wider than the grid boundary.</p>
          </DataGridPopoverContent>
        </Popover>
      </div>
    </ScreenshotFrame>
  );
}

test("grid popups respect toolbar width and stay actionable below it", async () => {
  await render(<BoundedPopup />);
  await page.getByRole("button", { name: "Open bounded popup" }).click();
  const popup = getByRole(document.body, "dialog", { name: "Bounded popup" });
  const boundary = document.querySelector('[data-testid="popup-boundary"]');
  if (!boundary) {
    throw new Error("Expected popup boundary");
  }
  await expect
    .poll(() => {
      const bounds = boundary.getBoundingClientRect();
      const rect = popup.getBoundingClientRect();
      return (
        rect.left >= bounds.left + 4 &&
        rect.top >= bounds.bottom &&
        rect.right <= bounds.right - 4 &&
        rect.bottom <= globalThis.innerHeight - 7
      );
    })
    .toBe(true);
  await page.getByRole("button", { name: "Popup action" }).click();
});

test("closing a lazily opened value dialog restores its cell trigger", async () => {
  await render(
    <ScreenshotFrame>
      <TextPreview
        columnName="notes"
        isTruncated={false}
        raw="Private notes"
        rawType="text"
      />
    </ScreenshotFrame>
  );
  const trigger = page.getByRole("button", {
    name: "View full text for notes",
  });
  await trigger.click();
  await expect
    .element(page.getByRole("dialog", { name: "notes text" }))
    .toBeVisible();
  await page.getByRole("dialog", { name: "notes text" }).press("Escape");
  await expect.element(trigger).toBeFocused();
});
