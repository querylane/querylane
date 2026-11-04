import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { screen } from "@testing-library/dom";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DataTable } from "@/components/querylane-ui/data-table";
import { SortableHeader } from "@/components/querylane-ui/data-table-controls";
import type { DataTableColumnDef } from "@/components/querylane-ui/data-table-model";
import { Input } from "@/components/ui/input";
import {
  DataTableDefaultScenario,
  DataTableSortedFilteredScenario,
} from "@/visual-harness/data-grid-scenarios";

const OWNER_SORT_BUTTON = /^Owner,/u;

// Pixels live in e2e/visual/data-table.spec.ts.
test("data table renders an unsorted metadata table by default", async () => {
  await render(
    <ScreenshotFrame>
      <DataTableDefaultScenario />
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("Database instances")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Instance, not sorted" }))
    .toBeVisible();
});

test("data table applies initial sorting and a controlled filter", async () => {
  await render(
    <ScreenshotFrame>
      <DataTableSortedFilteredScenario />
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("button", { name: "Instance, sorted ascending" }))
    .toBeVisible();
  await expect.element(page.getByText("analytics")).toBeVisible();
});

const columns: DataTableColumnDef<{ name: string; owner: string }>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader column={column}>Name</SortableHeader>
    ),
  },
  {
    accessorKey: "owner",
    header: ({ column }) => (
      <SortableHeader column={column}>Owner</SortableHeader>
    ),
  },
];
const rows = ["alpha", "beta", "gamma", "delta", "epsilon"].map((name) => ({
  name,
  owner: "admin",
}));

test("native header keys cycle aria-sort and reset the previous column", async () => {
  await render(
    <ScreenshotFrame>
      <DataTable
        columns={columns}
        data={rows}
        initialSorting={[{ id: "name", desc: false }]}
      />
    </ScreenshotFrame>
  );
  const owner = page.getByRole("button", { name: OWNER_SORT_BUTTON });
  await owner.focus();
  await owner.press("Enter");
  await expect
    .element(
      page.getByRole("columnheader", { name: "Owner, sorted ascending" })
    )
    .toHaveAttribute("aria-sort", "ascending");
  await expect
    .element(page.getByRole("columnheader", { name: "Name, not sorted" }))
    .toHaveAttribute("aria-sort", "none");
  await owner.press("Space");
  await expect
    .element(
      page.getByRole("columnheader", { name: "Owner, sorted descending" })
    )
    .toHaveAttribute("aria-sort", "descending");
  await owner.press("Enter");
  await expect
    .element(page.getByRole("columnheader", { name: "Owner, not sorted" }))
    .toHaveAttribute("aria-sort", "none");
});

test("loading reserves five-row geometry and footer with static decorative placeholders", async () => {
  const pending = await render(
    <ScreenshotFrame>
      <DataTable
        columns={columns}
        data={[]}
        emptyResourceName="databases"
        isPending={true}
        toolbarFilters={<Input aria-label="Search databases" />}
      />
    </ScreenshotFrame>
  );
  const table = screen.getByRole("table");
  const headerTop = screen
    .getByRole("columnheader", { name: "Name" })
    .getBoundingClientRect().top;
  const { height } = table.getBoundingClientRect();
  const footer = pending.container.querySelector(
    '[data-slot="data-table-footer"]'
  );
  const footerHeight = footer?.getBoundingClientRect().height;
  for (const skeleton of pending.container.querySelectorAll(
    '[data-slot="skeleton"]'
  )) {
    expect(getComputedStyle(skeleton).animationName).toBe("none");
  }
  expect(screen.queryByRole("combobox")).toBeNull();
  await pending.rerender(
    <ScreenshotFrame>
      <DataTable
        columns={columns}
        data={rows}
        emptyResourceName="databases"
        toolbarFilters={<Input aria-label="Search databases" />}
      />
    </ScreenshotFrame>
  );
  expect(
    screen.getByRole("columnheader", { name: "Name" }).getBoundingClientRect()
      .top
  ).toBe(headerTop);
  expect(
    Math.abs(screen.getByRole("table").getBoundingClientRect().height - height)
  ).toBeLessThanOrEqual(1);
  expect(footer?.getBoundingClientRect().height).toBe(footerHeight);
});

test("uncontrolled table search remains reactive across the compiler component boundary", async () => {
  await render(
    <ScreenshotFrame>
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="name"
        filterPlaceholder="Search loaded names"
      />
    </ScreenshotFrame>
  );
  const search = page.getByRole("textbox", { name: "Search loaded names" });
  await search.fill("alpha");
  await expect.element(search).toHaveValue("alpha");
  await expect
    .element(page.getByRole("cell", { name: "alpha", exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: "beta", exact: true }))
    .not.toBeAttached();
});
