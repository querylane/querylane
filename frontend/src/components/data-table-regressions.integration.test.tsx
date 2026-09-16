import { afterEach, describe, expect, it, rs } from "@rstest/core";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumnDef,
  SortableHeader,
} from "@/components/ui/data-table";

interface InstanceRow {
  name: string;
}

const columns: DataTableColumnDef<InstanceRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <SortableHeader column={column}>Instance</SortableHeader>
    ),
  },
];
const rows: InstanceRow[] = Array.from({ length: 30 }, (_, index) => ({
  name: `instance-${String(index + 1).padStart(2, "0")}`,
}));

afterEach(cleanup);

describe("shared data table adapter regressions", () => {
  // TanStack/table#6532: structurally equal updates must not notify React.
  it.each(["pagination", "sorting", "filtering"] as const)(
    "does not rerender cells for no-op %s updates",
    async (slice) => {
      const user = userEvent.setup();
      const renderCell = rs.fn((name: string) => name);
      const noOpColumns: DataTableColumnDef<InstanceRow>[] = [
        {
          accessorKey: "name",
          cell: ({ row }) => renderCell(row.original.name),
          header: ({ table }) => (
            <Button
              onClick={() => {
                switch (slice) {
                  case "pagination":
                    table.setPageIndex(-1);
                    table.setPageSize(10);
                    table.setPagination((previous) => ({ ...previous }));
                    break;
                  case "sorting":
                    table.setSorting([]);
                    break;
                  case "filtering":
                    table.setColumnFilters([]);
                    break;
                  default:
                    throw new Error(
                      `Unexpected slice: ${slice satisfies never}`
                    );
                }
              }}
            >
              Keep current state
            </Button>
          ),
        },
      ];

      render(<DataTable columns={noOpColumns} data={rows} />);
      expect(screen.getByText("Page 1 of 3")).toBeTruthy();
      const rendersBefore = renderCell.mock.calls.length;

      await user.click(
        screen.getByRole("button", { name: "Keep current state" })
      );

      expect(renderCell).toHaveBeenCalledTimes(rendersBefore);
      expect(screen.getByText("Page 1 of 3")).toBeTruthy();
      expect(screen.getByRole("cell", { name: "instance-01" })).toBeTruthy();
    }
  );

  it("composes same-tick functional pagination updates and resets", async () => {
    const user = userEvent.setup();
    const advance = rs.fn((pageIndex: number) => pageIndex + 1);
    const actionColumns: DataTableColumnDef<InstanceRow>[] = [
      {
        accessorKey: "name",
        header: ({ table }) => (
          <>
            <Button
              onClick={() => {
                table.setPageIndex(advance);
                table.setPageIndex(advance);
              }}
            >
              Advance 2 pages
            </Button>
            <Button
              onClick={() => {
                table.setPageIndex(0);
                table.setPageIndex(advance);
                table.resetPageIndex();
              }}
            >
              Advance then reset
            </Button>
          </>
        ),
      },
    ];

    render(<DataTable columns={actionColumns} data={rows} />);

    await user.click(screen.getByRole("button", { name: "Advance 2 pages" }));
    expect(advance).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "instance-21" })).toBeTruthy();
    expect(screen.queryByRole("cell", { name: "instance-01" })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Advance then reset" })
    );
    expect(advance).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "instance-01" })).toBeTruthy();
  });

  // Flat-row counterpart of TanStack/table#6568. Querylane does not expose
  // hierarchical subrows or workers; exercise metadata through real cells.
  it("preserves filtered row order and metadata through sorting and clearing", async () => {
    const user = userEvent.setup();
    const metadataColumns: DataTableColumnDef<InstanceRow>[] = [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortableHeader column={column}>Instance</SortableHeader>
        ),
        filterFn: (...[row, _columnId, value, addMeta]) => {
          if (typeof value !== "string") {
            return false;
          }
          addMeta?.({ query: value, name: row.original.name });
          return row.original.name.includes(value);
        },
      },
      {
        id: "metadata",
        header: "Filter metadata",
        cell: ({ row }) =>
          JSON.stringify(row.columnFiltersMeta["name"] ?? null),
      },
    ];
    const unorderedRows = [
      { name: "warehouse" },
      { name: "audit" },
      { name: "logs" },
      { name: "analytics" },
    ];
    render(
      <DataTable
        columns={metadataColumns}
        data={unorderedRows}
        filterColumn="name"
        filterPlaceholder="Filter instances"
      />
    );
    const filter = screen.getByRole("textbox", { name: "Filter instances" });

    await user.type(filter, "a");
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      [
        "warehouse",
        '{"query":"a","name":"warehouse"}',
        "audit",
        '{"query":"a","name":"audit"}',
        "analytics",
        '{"query":"a","name":"analytics"}',
      ]
    );

    await user.click(
      screen.getByRole("button", { name: "Instance, not sorted" })
    );
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      [
        "analytics",
        '{"query":"a","name":"analytics"}',
        "audit",
        '{"query":"a","name":"audit"}',
        "warehouse",
        '{"query":"a","name":"warehouse"}',
      ]
    );

    await user.clear(filter);
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      [
        "analytics",
        "null",
        "audit",
        "null",
        "logs",
        "null",
        "warehouse",
        "null",
      ]
    );
  });

  it("recovers pagination after data shrinks, empties, and repopulates", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DataTable columns={columns} data={rows} />);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();

    rerender(<DataTable columns={columns} data={rows.slice(0, 3)} />);
    await waitFor(() => {
      expect(screen.getByText("Page 1 of 1")).toBeTruthy();
      expect(
        within(screen.getByRole("table")).getAllByRole("cell")
      ).toHaveLength(3);
    });
    expect(
      screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled")
    ).toBe(true);

    rerender(<DataTable columns={columns} data={[]} />);
    expect(await screen.findByText("No results found")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();

    rerender(<DataTable columns={columns} data={rows} />);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "instance-11" })).toBeTruthy();
  });
});
