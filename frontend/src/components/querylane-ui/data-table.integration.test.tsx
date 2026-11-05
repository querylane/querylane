import { afterEach, expect, test } from "@rstest/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";

afterEach(cleanup);

interface Row {
  name: string;
  owner: string;
}
const columns: DataTableColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name", enableHiding: false },
  { accessorKey: "owner", header: "Owner" },
];

test("column selection hides headers and cells without removing rows", async () => {
  const user = userEvent.setup();
  render(
    <DataTable
      columns={columns}
      data={[{ name: "analytics", owner: "postgres" }]}
      tableKey="databases"
    />
  );
  const columnControl = screen.getByRole("button", { name: "Columns" });
  expect(columnControl.textContent).toBe("");
  await user.click(columnControl);
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Owner" }));
  expect(screen.queryByRole("columnheader", { name: "Owner" })).toBeNull();
  expect(within(screen.getByRole("table")).queryByText("postgres")).toBeNull();
  expect(screen.getByRole("cell", { name: "analytics" })).toBeTruthy();
});

test("last visible column stays available and reset restores defaults", async () => {
  const user = userEvent.setup();
  render(
    <DataTable
      columns={columns.map((column) => ({ ...column, enableHiding: true }))}
      data={[]}
      tableKey="empty"
    />
  );
  await user.click(screen.getByRole("button", { name: "Columns" }));
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Owner" }));
  expect(
    screen
      .getByRole("menuitemcheckbox", { name: "Name" })
      .getAttribute("aria-disabled")
  ).toBe("true");
  expect(screen.getByRole("cell").getAttribute("colspan")).toBe("1");
  await user.click(screen.getByRole("menuitem", { name: "Reset columns" }));
  expect(screen.getAllByRole("columnheader")).toHaveLength(2);
});
