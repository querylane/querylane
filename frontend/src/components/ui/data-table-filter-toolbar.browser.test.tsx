import { useState } from "react";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DataTableFilterToolbar } from "@/components/ui/data-table-filter-toolbar";

function ActiveFilterToolbarFixture() {
  const [searchValue, setSearchValue] = useState("customer");
  const [kind, setKind] = useState(["regular"]);
  const [owner, setOwner] = useState(["analytics"]);

  function clearAll() {
    setSearchValue("");
    setKind([]);
    setOwner([]);
  }

  return (
    <ScreenshotFrame>
      <div
        className="w-[760px] rounded-lg border border-border bg-card p-4"
        data-testid="filter-toolbar-visual"
      >
        <DataTableFilterToolbar
          facets={[
            {
              label: "Kind",
              onChange: setKind,
              options: [
                { count: 3, label: "Regular", value: "regular" },
                { count: 1, label: "Template", value: "template" },
              ],
              selected: kind,
              singleSelect: true,
            },
            {
              label: "Owner",
              onChange: setOwner,
              options: [
                { count: 2, label: "analytics", value: "analytics" },
                { count: 1, label: "postgres", value: "postgres" },
              ],
              selected: owner,
            },
          ]}
          onClearAll={clearAll}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search databases..."
          searchValue={searchValue}
        />
      </div>
    </ScreenshotFrame>
  );
}

test("active filter toolbar matches the standardized visual treatment", async () => {
  render(<ActiveFilterToolbarFixture />);

  await expect
    .element(page.getByRole("textbox", { name: "Search databases..." }))
    .toHaveValue("customer");
  await expect
    .element(page.getByRole("button", { name: "Kind Regular" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Owner analytics" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Clear all" }))
    .toBeVisible();
  await document.fonts.ready;
  await expect(page.getByTestId("filter-toolbar-visual")).toMatchScreenshot(
    "data-table-filter-toolbar-active"
  );
});
