import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import {
  DataTable,
  SortableHeader,
  type DataTableColumnDef,
} from "@/components/ui/data-table";

type InstanceRow = {
  name: string;
  owner: string;
  status: "connected" | "error";
};

const columns: DataTableColumnDef<InstanceRow>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => row.original.name,
    header: ({ column }) => (
      <SortableHeader column={column}>Instance</SortableHeader>
    ),
  },
  {
    accessorKey: "owner",
    cell: ({ row }) => row.original.owner,
    header: "Owner",
  },
  {
    accessorKey: "status",
    cell: ({ row }) => row.original.status,
    header: "Status",
  },
];

const rows: InstanceRow[] = [
  { name: "analytics", owner: "data_team", status: "connected" },
  { name: "audit", owner: "security", status: "connected" },
  { name: "warehouse", owner: "platform", status: "error" },
  { name: "staging", owner: "platform", status: "connected" },
  { name: "billing", owner: "finance", status: "error" },
];

function renderDataTableFixture({
  filterValue,
  initialSorting,
}: {
  filterValue?: string;
  initialSorting?: Array<{ desc: boolean; id: string }>;
} = {}) {
  const controlledFilterProps =
    filterValue === undefined
      ? {}
      : { filterValue, onFilterChange: () => undefined };
  const initialSortingProps =
    initialSorting === undefined ? {} : { initialSorting };

  render(
    <ScreenshotFrame>
      <div className="w-[760px] rounded-xl border border-border bg-background p-5 text-foreground">
        <div className="mb-4">
          <h2 className="font-semibold text-base">Database instances</h2>
          <p className="text-muted-foreground text-sm">
            Visual fixture for metadata table sorting, filtering, and pagination.
          </p>
        </div>
        <DataTable
          columns={columns}
          data={rows}
          filterColumn="name"
          filterPlaceholder="Filter instances..."
          pageSize={3}
          {...controlledFilterProps}
          {...initialSortingProps}
        />
      </div>
    </ScreenshotFrame>
  );
}

test("data table visual: default metadata table", async () => {
  renderDataTableFixture();

  await expect.element(page.getByText("Database instances")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Instance, not sorted" }))
    .toBeVisible();

  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-table-default"
  );
});

test("data table visual: sorted and filtered metadata table", async () => {
  renderDataTableFixture({
    filterValue: "a",
    initialSorting: [{ desc: false, id: "name" }],
  });

  await expect
    .element(page.getByRole("button", { name: "Instance, sorted ascending" }))
    .toBeVisible();
  await expect.element(page.getByText("analytics")).toBeVisible();

  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-table-sorted-filtered"
  );
});
