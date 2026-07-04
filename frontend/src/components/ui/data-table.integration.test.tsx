import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
];


afterEach(() => {
  cleanup();
  window.history.pushState(null, "", "/");});

describe("data table integration", () => {
  it("renders Querylane's local filter affordance only when the table owns filter state", () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="name"
        filterPlaceholder="Filter instances..."
      />
    );

    expect(screen.getByPlaceholderText("Filter instances...")).toBeTruthy();
  });

  it("defers filter controls to the parent surface when filter state is controlled", () => {
    const onFilterChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="name"
        filterValue="ware"
        onFilterChange={onFilterChange}
      />
    );

    expect(screen.queryByPlaceholderText(/filter/i)).toBeNull();
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it("applies controlled filter values from the parent surface", async () => {
    const onFilterChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="name"
        filterValue="ware"
        onFilterChange={onFilterChange}
      />
    );

    expect(await screen.findByText("warehouse")).toBeTruthy();
    expect(screen.queryByText("analytics")).toBeNull();
    expect(screen.queryByText("audit")).toBeNull();

    rerender(
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="name"
        filterValue=""
        onFilterChange={onFilterChange}
      />
    );

    expect(await screen.findByText("analytics")).toBeTruthy();
    expect(screen.getByText("audit")).toBeTruthy();
    expect(screen.getByText("warehouse")).toBeTruthy();
  });

  it("renders Querylane's empty table copy for an empty result set", () => {
    render(<DataTable columns={columns} data={[]} />);

    expect(screen.getByText("No results found")).toBeTruthy();
  });

  it("renders specific empty copy when local search has no matches", async () => {
    const user = userEvent.setup();

    render(
      <DataTable
        columns={columns}
        data={rows}
        emptyResourceName="instances"
        filterColumn="name"
        filterPlaceholder="Filter instances..."
      />
    );

    await user.type(
      screen.getByRole("textbox", { name: "Filter instances..." }),
      "missing"
    );

    expect(await screen.findByText("No instances found")).toBeTruthy();
  });

  it("returns to the first page when local filtering narrows paginated rows", async () => {
    const user = userEvent.setup();

    render(
      <DataTable
        columns={columns}
        data={rows}
        filterColumn="name"
        filterPlaceholder="Filter instances..."
        pageSize={2}
      />
    );

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("warehouse")).toBeTruthy();

    await user.type(
      screen.getByRole("textbox", { name: "Filter instances..." }),
      "analytics"
    );

    expect(await screen.findByText("analytics")).toBeTruthy();
    expect(screen.queryByText("warehouse")).toBeNull();
  });

  it("emits the original Querylane row when an interactive row is selected", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();

    render(<DataTable columns={columns} data={rows} onRowClick={onRowClick} />);

    await user.click(screen.getByText("audit"));

    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it("renders sortable column headers as accessible Querylane controls", () => {
    render(<DataTable columns={columns} data={rows} />);

    expect(screen.getByRole("button", { name: /Instance/ })).toBeTruthy();
  });

  it("announces sortable header state as sorting changes", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // Asserted below. Keeps React's stderr warning from escaping if this regresses.
    });

    try {
      render(<DataTable columns={columns} data={rows} />);

      await user.click(
        screen.getByRole("button", { name: "Instance, not sorted" })
      );
      expect(
        screen.getByRole("button", { name: "Instance, sorted ascending" })
      ).toBeTruthy();

      await user.click(
        screen.getByRole("button", { name: "Instance, sorted ascending" })
      );
      expect(
        screen.getByRole("button", { name: "Instance, sorted descending" })
      ).toBeTruthy();

      await user.click(
        screen.getByRole("button", { name: "Instance, sorted descending" })
      );
      expect(
        screen.getByRole("button", { name: "Instance, not sorted" })
      ).toBeTruthy();

      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses a clear full-size sort indicator in sortable headers", () => {
    render(<DataTable columns={columns} data={rows} />);

    const button = screen.getByRole("button", { name: /Instance/ });
    const indicator = button.querySelector('[data-slot="sort-indicator"]');

    expect(indicator).toBeTruthy();
    expect(indicator?.classList.contains("size-4")).toBe(true);
  });
});
