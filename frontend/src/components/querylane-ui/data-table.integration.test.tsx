import { expect, test } from "@rstest/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "@/components/querylane-ui/data-table";
import { SortableHeader } from "@/components/querylane-ui/data-table-controls";
import type { DataTableColumnDef } from "@/components/querylane-ui/data-table-model";

const MATCH_PATTERN_1 = /Name/u;
const MATCH_PATTERN_2 = /Owner/u;
const MATCH_PATTERN_3 = /No databases/u;
const MATCH_PATTERN_4 = /Page 1 of/u;
const MATCH_PATTERN_5 = /Showing 1–2 of 2/u;

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
const data = [
  { name: "beta", owner: "admin" },
  { name: "alpha", owner: "user" },
];

test("column headers expose initial sorting and keyboard sorting clears the previous header", async () => {
  const user = userEvent.setup();
  render(
    <DataTable
      columns={columns}
      data={data}
      distinguishEmpty={true}
      initialSorting={[{ id: "name", desc: false }]}
    />
  );
  expect(
    screen
      .getByRole("columnheader", { name: MATCH_PATTERN_1 })
      .getAttribute("aria-sort")
  ).toBe("ascending");
  const owner = screen.getByRole("button", { name: "Owner, not sorted" });
  owner.focus();
  await user.keyboard("{Enter}");
  expect(
    screen
      .getByRole("columnheader", { name: MATCH_PATTERN_1 })
      .getAttribute("aria-sort")
  ).toBe("none");
  expect(
    screen
      .getByRole("columnheader", { name: MATCH_PATTERN_2 })
      .getAttribute("aria-sort")
  ).toBe("ascending");
  await user.keyboard(" ");
  expect(
    screen
      .getByRole("columnheader", { name: MATCH_PATTERN_2 })
      .getAttribute("aria-sort")
  ).toBe("descending");
  await user.keyboard("{Enter}");
  expect(
    screen
      .getByRole("columnheader", { name: MATCH_PATTERN_2 })
      .getAttribute("aria-sort")
  ).toBe("none");
});

test("pending metadata retains headers and toolbar, reserves footer, then refresh retains real rows", () => {
  const { rerender } = render(
    <DataTable
      columns={columns}
      data={[]}
      distinguishEmpty={true}
      emptyResourceName="databases"
      isPending={true}
      toolbarFilters={<span>Filters</span>}
    />
  );
  expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe("Loading databases…");
  expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  expect(screen.getByText("Filters")).toBeTruthy();
  expect(screen.queryByText(MATCH_PATTERN_3)).toBeNull();
  expect(screen.queryByText(MATCH_PATTERN_4)).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(
    screen.getByRole("table").querySelectorAll('tbody tr[aria-hidden="true"]')
      .length
  ).toBeGreaterThan(0);
  rerender(
    <DataTable
      columns={columns}
      data={data}
      distinguishEmpty={true}
      emptyResourceName="databases"
      isPending={false}
      isRefreshing={true}
    />
  );
  expect(screen.getByText("beta")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("Refreshing databases…");
  expect(screen.getByText(MATCH_PATTERN_5)).toBeTruthy();
  rerender(
    <DataTable
      columns={columns}
      data={[]}
      distinguishEmpty={true}
      emptyResourceName="databases"
    />
  );
  expect(screen.getByText("No databases available.")).toBeTruthy();
  rerender(
    <DataTable
      columns={columns}
      data={[]}
      distinguishEmpty={true}
      emptyResourceName="databases"
      filterColumn="name"
      filterValue="missing"
      onFilterChange={() => undefined}
    />
  );
  expect(screen.getByText("No databases found")).toBeTruthy();
});

test("controlled sorting reorders all loaded rows before pagination and responds to external state", async () => {
  const user = userEvent.setup();
  const changes: unknown[] = [];
  const { rerender } = render(
    <DataTable
      columns={columns}
      data={data}
      distinguishEmpty={true}
      onSortingChange={(value) => {
        changes.push(value);
      }}
      sorting={[{ id: "name", desc: false }]}
    />
  );
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("alpha");
  await user.click(
    screen.getByRole("button", { name: "Name, sorted ascending" })
  );
  expect(changes).toEqual([[{ id: "name", desc: true }]]);
  rerender(
    <DataTable
      columns={columns}
      data={data}
      distinguishEmpty={true}
      onSortingChange={(value) => {
        changes.push(value);
      }}
      sorting={[{ id: "name", desc: true }]}
    />
  );
  expect(screen.getAllByRole("cell")[0]?.textContent).toBe("beta");
});
