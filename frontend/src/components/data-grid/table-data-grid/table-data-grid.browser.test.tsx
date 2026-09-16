import "./header-edge-fixture.css";
import { page } from "@rstest/browser";
import { cleanup, render } from "@rstest/browser-react";
import { afterEach, expect, rs, test } from "@rstest/core";
import { screen, within } from "@testing-library/dom";
import type { ReactNode } from "react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { ColumnHeader } from "@/components/data-grid/table-data-grid/column-header";
import { DataGridToolbar } from "@/components/data-grid/table-data-grid/data-grid-toolbar";
import { GridStatusBar } from "@/components/data-grid/table-data-grid/grid-status-bar";
import { GridSurface } from "@/components/data-grid/table-data-grid/grid-surface";
import { PaginationFooter } from "@/components/data-grid/table-data-grid/pagination-footer";
import { RecordDetailDrawer } from "@/components/data-grid/table-data-grid/record-detail-drawer";
import { TableDataGrid } from "@/components/data-grid/table-data-grid/table-data-grid";
import { useTableColumnLayoutSettingsStore } from "@/features/user-settings/table-column-layout-settings";
import { HIGH_VOLUME_PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import {
  type TableCell,
  TableDataService,
  type TableResultColumn,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  DataType,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  CUSTOMERS_TABLE_NAME,
  dataGridFixtureServices,
  ORDERS_TABLE_NAME,
} from "@/test/fixtures/data-grid-fixtures";
import { createTestRouterTransport } from "@/test/router-transport";
import {
  gridCell as cell,
  gridColumn as column,
  CUSTOMER_COLUMNS as resultColumns,
  SORTABLE_COLUMNS as sortableColumns,
} from "@/visual-harness/data-grid-scenario-data";
import {
  DataExplorerControlsScenario,
  DataGridAdvancedFilterToolbarScenario,
  DataGridColumnProjectionToolbarScenario,
  DataGridEmptyFilterToolbarScenario,
  DataGridFilteredToolbarScenario,
  DataGridOffsetFilterToolbarScenario,
  DataValueDialogGuardScenario,
  RecordDetailDrawerScenario,
} from "@/visual-harness/data-grid-scenarios";
import { HarnessProviders } from "@/visual-harness/harness-providers";

import "@/components/data-grid/table-data-grid/data-grid-theme.css";

// Pixels for these states live in e2e/visual/data-grid.spec.ts. This file
// keeps the behavior, geometry, and computed-style assertions.

afterEach(async () => {
  await cleanup();
  useTableColumnLayoutSettingsStore.setState({ layouts: {} });
  localStorage.removeItem("querylane-table-column-layouts");
});

const PAGE_LABEL_RE = /Page \d+/;
const EXPANDED_GRID_CLASS =
  "h-[620px] w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground";
const SELECTED_CELLS = '[data-cell-range-selected="true"]';

function browserColorChannels(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("expected a 2D canvas context");
  }
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return Array.from(context.getImageData(0, 0, 1, 1).data);
}

function colorContrastRatio(first: string, second: string) {
  function compositeColor(foreground: string, background: string) {
    const foregroundChannels = browserColorChannels(foreground);
    const backgroundChannels = browserColorChannels(background);
    const alpha = (foregroundChannels[3] ?? 255) / 255;
    return foregroundChannels
      .slice(0, 3)
      .map(
        (channel, index) =>
          channel * alpha + (backgroundChannels[index] ?? 0) * (1 - alpha)
      );
  }
  function relativeLuminance(channels: number[]) {
    const linearChannels = channels.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.040_45
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (
      0.2126 * (linearChannels[0] ?? 0) +
      0.7152 * (linearChannels[1] ?? 0) +
      0.0722 * (linearChannels[2] ?? 0)
    );
  }
  const firstLuminance = relativeLuminance(compositeColor(first, second));
  const secondLuminance = relativeLuminance(
    browserColorChannels(second).slice(0, 3)
  );
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function columnLayoutProps(columns: TableResultColumn[]) {
  return {
    columnOrder: columns.map((resultColumn) => resultColumn.columnName),
    fetchVisibleColumns: false,
    hiddenColumnKeys: new Set<string>(),
    isColumnLayoutCustomized: false,
    onColumnLayoutReset: rs.fn(),
    onColumnOrderChange: rs.fn(),
    onColumnVisibilityChange: rs.fn(),
    onFetchVisibleColumnsChange: rs.fn(),
  };
}

function toolbarHandlers() {
  return {
    onClearSelection: rs.fn(),
    onCopySelection: rs.fn(),
    onExportSelection: rs.fn(),
    onFilterChange: rs.fn(),
    onRefresh: rs.fn(),
    onSortChange: rs.fn(),
  };
}

function gridCellContaining(
  text: string,
  container: HTMLElement = document.body
) {
  const gridCell = within(container).getByText(text).closest(".rdg-cell");
  if (!(gridCell instanceof HTMLElement)) {
    throw new Error(`Expected "${text}" inside a grid cell.`);
  }
  return gridCell;
}

function selectedCellCount(container: ParentNode = document) {
  return container.querySelectorAll(SELECTED_CELLS).length;
}

function centerOf(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function renderScenario(Scenario: () => ReactNode) {
  await render(
    <ScreenshotFrame>
      <Scenario />
    </ScreenshotFrame>
  );
}

async function renderLongRecordDrawer() {
  const columns = [
    column("implementation_info_id", "character varying", DataType.STRING),
    column("implementation_info_name", "character varying", DataType.STRING),
    column("integer_value", "integer", DataType.INTEGER),
    column("character_value", "character varying", DataType.STRING),
    column("comments", "character varying", DataType.STRING),
  ];
  const rowCells = new Map<string, TableCell | undefined>([
    ["implementation_info_id", cell({ case: "stringValue", value: "13" })],
    [
      "implementation_info_name",
      cell({ case: "stringValue", value: "SERVER NAME" }),
    ],
    ["integer_value", cell({ case: "nullValue", value: 0 })],
    ["character_value", cell({ case: "stringValue", value: "" })],
    ["comments", cell({ case: "nullValue", value: 0 })],
  ]);

  await render(
    // Record fields load full values through a mutation, which needs a query
    // client even though it never fires here.
    <HarnessProviders>
      <ScreenshotFrame>
        <div className="w-[980px] rounded-2xl border border-border bg-background p-6 text-foreground">
          <RecordDetailDrawer
            columns={columns}
            hasNext={true}
            hasPrev={true}
            name="instances/prod/databases/app/schemas/information_schema/tables/sql_implementation_info"
            onNext={rs.fn()}
            onOpenChange={rs.fn()}
            onPrev={rs.fn()}
            onRowIndexChange={rs.fn()}
            open={true}
            pkColumnSet={new Set()}
            rowCells={rowCells}
            rowCount={12}
            rowIndex={8}
            tableName={{
              schema: "information_schema",
              table: "sql_implementation_info_with_extra_long_suffix",
            }}
          />
        </div>
      </ScreenshotFrame>
    </HarnessProviders>
  );
}

async function renderSortableToolbar() {
  await render(
    <ScreenshotFrame>
      <div className="w-[900px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <DataGridToolbar
          {...columnLayoutProps(sortableColumns)}
          {...toolbarHandlers()}
          columns={sortableColumns}
          filterLogic="and"
          filterRules={[]}
          isFetching={false}
          selectedCount={0}
          sortColumns={[
            { columnKey: "stat_date", direction: "ASC" },
            { columnKey: "new_customers", direction: "ASC" },
            { columnKey: "page_views", direction: "DESC" },
            { columnKey: "total_revenue", direction: "ASC" },
            { columnKey: "total_orders", direction: "DESC" },
          ]}
        />
      </div>
    </ScreenshotFrame>
  );
}

async function renderSelectedHeaderEdgeFixture() {
  await render(
    <ScreenshotFrame>
      <table
        aria-label="Selected table header edge fixture"
        className="rdg selected-header-edge-fixture"
      >
        <thead>
          <tr className="rdg-header-row">
            <th className="rdg-cell" scope="col">
              name
            </th>
            <th
              aria-selected="true"
              className="rdg-cell rounded-se-control-sm rounded-ee-control-sm"
              scope="col"
            >
              created_at
            </th>
          </tr>
        </thead>
      </table>
    </ScreenshotFrame>
  );
}

async function renderOrdersGrid(
  className: string,
  services = dataGridFixtureServices()
) {
  const transport = createTestRouterTransport((router) => {
    router.service(TableService, services.table);
    router.service(TableDataService, services.tableData);
  });

  await render(
    <HarnessProviders transport={transport}>
      <ScreenshotFrame>
        <div className={className}>
          <TableDataGrid
            foreignKeyReferences={[
              {
                sourceColumns: ["customer_id"],
                targetColumns: ["id"],
                targetTableName: CUSTOMERS_TABLE_NAME,
              },
            ]}
            initialPageSize={10}
            name={ORDERS_TABLE_NAME}
            renderOpenReferencedTableLink={() => (
              <a href="/explorer?schema=public&table=customers">Open table</a>
            )}
          />
        </div>
      </ScreenshotFrame>
    </HarnessProviders>
  );
  await expect
    .element(page.getByText("arun.patel@example.com", { exact: true }))
    .toBeVisible();
}

function getPopoverBox() {
  const popover = document.querySelector<HTMLElement>(
    '[data-slot="popover-content"]'
  );
  if (!popover) {
    throw new Error("expected popover");
  }
  const popoverBox = popover.getBoundingClientRect();

  return {
    bottom: popoverBox.bottom,
    element: popover,
    left: popoverBox.left,
    right: popoverBox.right,
    top: popoverBox.top,
  };
}

function getPopoverBoundary() {
  const boundary = document.querySelector<HTMLElement>(
    "[data-slot='data-grid-popover-boundary']"
  );
  if (!boundary) {
    throw new Error("expected data-grid popover boundary");
  }
  return boundary;
}

async function openExpandedGrid() {
  await page.getByRole("button", { name: "Expand data grid" }).click();
  const dialog = page.getByRole("dialog", { name: "Expanded data grid" });
  await expect.element(dialog).toBeVisible();
  return {
    dialog,
    dialogElement: screen.getByRole("dialog", { name: "Expanded data grid" }),
  };
}

test("data explorer controls and row detail drawer expose dense table context", async () => {
  await render(
    <ScreenshotFrame>
      <DataExplorerControlsScenario />
      <RecordDetailDrawerScenario />
    </ScreenshotFrame>
  );

  await expect.element(page.getByText("Data explorer controls")).toBeVisible();
  await expect.element(page.getByText("3 selected")).toBeVisible();
  await expect.element(page.getByText("Page 3 of 6")).toBeVisible();
  await expect.element(page.getByText("public.customers")).toBeVisible();
  await expect.element(page.getByText("PK")).toBeVisible();
});

test("failed page loads keep prior rows visibly stale without false pagination", async () => {
  await renderOrdersGrid(
    "h-[600px] w-[1120px] rounded-xl border border-border bg-background p-6 text-foreground",
    dataGridFixtureServices({ failNextPage: true })
  );
  await page.getByRole("button", { name: "Next page" }).click();

  await expect
    .element(page.getByText("PostgreSQL instance unavailable"))
    .toBeVisible();
  await expect
    .element(
      page.getByText("Showing the last loaded rows until retry succeeds.")
    )
    .toBeVisible();
  await expect.element(page.getByText("arun.patel@example.com")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Next page" }))
    .toHaveCount(0);
  await expect.element(page.getByText(PAGE_LABEL_RE)).toHaveCount(0);
});

test("expanded data grid prioritizes space for rows", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  const { dialog, dialogElement } = await openExpandedGrid();
  const dialogTitleStyle = getComputedStyle(
    within(dialogElement).getByText("Expanded data grid")
  );
  expect(dialogTitleStyle.position).toBe("absolute");
  expect(dialogTitleStyle.width).toBe("1px");
  await expect
    .element(
      dialog.getByText(
        "Use the same filters, sorting, selection, and pagination with more room for rows and columns."
      )
    )
    .toBeDetached();

  const dialogHeight = dialogElement.getBoundingClientRect().height;
  const gridHeight = within(dialogElement)
    .getByTestId("grid-refresh-surface")
    .getBoundingClientRect().height;
  expect(gridHeight / dialogHeight).toBeGreaterThan(0.7);
});

test("expanded data grid keeps close and refresh actions separate", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  const { dialog, dialogElement } = await openExpandedGrid();
  await expect
    .element(dialog.getByRole("button", { name: "Close" }))
    .toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Refresh rows" }))
    .toBeVisible();

  const closeBox = within(dialogElement)
    .getByRole("button", { name: "Close" })
    .getBoundingClientRect();
  const refreshBox = within(dialogElement)
    .getByRole("button", { name: "Refresh rows" })
    .getBoundingClientRect();
  expect(refreshBox.right).toBeLessThanOrEqual(closeBox.left - 8);
});

test("Escape clears cell selection without closing the expanded grid", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  const { dialog, dialogElement } = await openExpandedGrid();
  await dialog.getByText("arun.patel@example.com", { exact: true }).click();
  const referenceCell = gridCellContaining(
    "arun.patel@example.com",
    dialogElement
  );
  expect(selectedCellCount(dialogElement)).toBe(1);
  expect(document.activeElement).toBe(referenceCell);

  await dialog
    .getByRole("gridcell", { name: "arun.patel@example.com" })
    .press("Escape");

  await rs.waitFor(() => {
    expect(selectedCellCount(dialogElement)).toBe(0);
    expect(dialogElement.getAttribute("data-open")).toBe("");
    expect(dialogElement.hasAttribute("data-closed")).toBe(false);
  });
  await expect.element(dialog).toBeVisible();
});

test("column headers reorder while layout controls stay compact", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  const statusHeaderLocator = page.getByRole("columnheader").filter({
    has: page.getByRole("button", {
      name: "Open options for column status",
    }),
  });
  await expect
    .element(statusHeaderLocator)
    .toHaveAttribute("draggable", "true");
  const statusHeader = screen
    .getByRole("button", { name: "Open options for column status" })
    .closest('[role="columnheader"]');
  const customerHeader = screen
    .getByRole("button", { name: "Open options for column customer_id" })
    .closest('[role="columnheader"]');
  if (!(statusHeader && customerHeader)) {
    throw new Error("Expected draggable column headers.");
  }
  const dataTransfer = new DataTransfer();
  statusHeader.dispatchEvent(
    new DragEvent("dragstart", { bubbles: true, dataTransfer })
  );
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  customerHeader.dispatchEvent(
    new DragEvent("dragover", { bubbles: true, dataTransfer })
  );
  customerHeader.dispatchEvent(
    new DragEvent("drop", { bubbles: true, dataTransfer })
  );
  statusHeader.dispatchEvent(
    new DragEvent("dragend", { bubbles: true, dataTransfer })
  );

  await page.getByRole("button", { name: "Columns" }).click();
  const popover = page.getByRole("dialog", { name: "Manage columns" });
  await expect.element(popover).toBeVisible();
  const popoverElement = screen.getByRole("dialog", { name: "Manage columns" });
  const statusToggle = within(popoverElement).getByRole("checkbox", {
    name: "status",
  });
  const customerToggle = within(popoverElement).getByRole("checkbox", {
    name: "customer_id",
  });
  expect(statusToggle.getBoundingClientRect().top).toBeLessThan(
    customerToggle.getBoundingClientRect().top
  );
  await popover.getByRole("checkbox", { name: "customer_id" }).click();

  await expect
    .element(
      page.getByRole("button", { name: "Open options for column status" })
    )
    .toBeVisible();
  await expect
    .element(
      page.getByRole("button", {
        name: "Open options for column customer_id",
      })
    )
    .toBeDetached();
});

test("select-all stays tooltip-free and preserves native selection behavior", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  const selectAllCheckbox = page.getByRole("checkbox", { name: "Select All" });
  await expect.element(selectAllCheckbox).toBeVisible();
  const selectAllBox = screen
    .getByRole("checkbox", { name: "Select All" })
    .closest('[data-slot="grid-checkbox"]');
  if (!(selectAllBox instanceof HTMLElement)) {
    throw new Error("Expected the select-all input inside its styled box.");
  }
  const selectAllBoxStyle = getComputedStyle(selectAllBox);
  expect(selectAllBoxStyle.inlineSize).toBe("16px");
  expect(selectAllBoxStyle.blockSize).toBe("16px");
  expect(selectAllBoxStyle.borderRadius).toBe("4px");
  await expect
    .element(selectAllCheckbox)
    .toHaveAttribute("title", "Select all rows on this page");
  await selectAllCheckbox.hover();

  await expect.element(page.getByRole("tooltip")).toBeDetached();

  function rowCheckboxes() {
    return screen.getAllByRole<HTMLInputElement>("checkbox", {
      name: "Select",
    });
  }

  await selectAllCheckbox.click();
  await expect.element(selectAllCheckbox).toBeChecked();
  await expect
    .element(selectAllCheckbox)
    .toHaveAttribute("title", "Clear selection");
  expect(rowCheckboxes()).not.toHaveLength(0);
  for (const rowCheckbox of rowCheckboxes()) {
    expect(rowCheckbox.checked).toBe(true);
  }

  await selectAllCheckbox.click();
  await expect.element(selectAllCheckbox).toBeUnchecked();
  for (const rowCheckbox of rowCheckboxes()) {
    expect(rowCheckbox.checked).toBe(false);
  }
});

test("keyboard navigation extends and clears a multi-cell selection", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  await page.getByText("arun.patel@example.com", { exact: true }).click();
  const referenceCell = gridCellContaining("arun.patel@example.com");

  referenceCell.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      key: "ArrowRight",
      shiftKey: true,
    })
  );

  await rs.waitFor(() => {
    expect(selectedCellCount()).toBe(2);
  });
  const selectedCells = Array.from(
    document.querySelectorAll<HTMLElement>(SELECTED_CELLS)
  );
  expect(selectedCells[0]?.getAttribute("data-cell-range-left")).toBe("true");
  expect(selectedCells[1]?.getAttribute("data-cell-range-right")).toBe("true");
  expect(
    getComputedStyle(selectedCells[0] as HTMLElement).backgroundColor
  ).not.toBe("rgba(0, 0, 0, 0)");

  const activeCell = document.querySelector<HTMLElement>(
    '[data-cell-range-active="true"]'
  );
  if (!activeCell) {
    throw new Error("Expected an active selected cell.");
  }
  activeCell.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
  );

  await rs.waitFor(() => {
    expect(selectedCellCount()).toBe(0);
  });

  activeCell.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "a",
    })
  );

  await rs.waitFor(() => {
    expect(selectedCellCount()).toBe(15);
  });
  expect(
    document.querySelector(`.rdg-select-cell${SELECTED_CELLS}`)
  ).toBeNull();

  activeCell.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
  );
  await rs.waitFor(() => {
    expect(selectedCellCount()).toBe(0);
  });

  // Mouse drag from the email cell back to the status cell selects the range.
  const statusCell = gridCellContaining("in_transit");
  const start = centerOf(referenceCell);
  const end = centerOf(statusCell);
  referenceCell.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
      pointerId: 5,
      pointerType: "mouse",
    })
  );
  referenceCell.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: end.x,
      clientY: end.y,
      pointerId: 5,
      pointerType: "mouse",
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 5,
      pointerType: "mouse",
    })
  );

  await rs.waitFor(() => {
    expect(selectedCellCount()).toBe(2);
  });
});

test("grid exposes selected cell state without selection toolbar", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  await expect
    .element(page.getByRole("grid", { name: "Table data" }))
    .toBeVisible();
  await page.getByText("arun.patel@example.com", { exact: true }).click();
  const referenceCell = gridCellContaining("arun.patel@example.com");

  expect(referenceCell.getAttribute("aria-selected")).toBe("true");
  await expect
    .element(page.getByRole("status", { name: "Cell selection" }))
    .toContainText("1 cell selected in 1 row by 1 column.");
  await expect.element(page.getByText("1 cell · 1×1")).toBeDetached();
  await expect
    .element(page.getByRole("button", { name: "Copy selected cells" }))
    .toBeDetached();
  await expect
    .element(page.getByRole("button", { name: "Clear cell selection" }))
    .toBeDetached();
});

test("touch pointer drag selects a cell range", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  await expect.element(page.getByText("maria.chen@example.com")).toBeVisible();
  const startCell = gridCellContaining("arun.patel@example.com");
  const endCell = gridCellContaining("maria.chen@example.com");
  const start = centerOf(startCell);
  const end = centerOf(endCell);
  expect(getComputedStyle(startCell).touchAction).toBe("auto");

  startCell.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
      pointerId: 6,
      pointerType: "touch",
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 6,
      pointerType: "touch",
    })
  );
  await rs.waitFor(() => {
    expect(selectedCellCount()).toBe(1);
    expect(getComputedStyle(startCell).touchAction).toBe("none");
  });

  startCell.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
      pointerId: 7,
      pointerType: "touch",
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: end.x,
      clientY: end.y,
      pointerId: 7,
      pointerType: "touch",
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 7,
      pointerType: "touch",
    })
  );

  await rs.waitFor(() => {
    expect(selectedCellCount()).toBe(2);
  });
});

test("dragging near a grid edge auto-scrolls the cell selection", async () => {
  await renderOrdersGrid(
    "h-[620px] w-[420px] rounded-2xl border border-border bg-background p-6 text-foreground"
  );

  await expect.element(page.getByText("1001", { exact: true })).toBeVisible();
  const startCell = gridCellContaining("1001");
  const grid = document.querySelector<HTMLElement>(".rdg");
  if (!grid) {
    throw new Error("Expected auto-scroll grid elements.");
  }
  expect(grid.scrollWidth).toBeGreaterThan(grid.clientWidth);
  const start = centerOf(startCell);
  const gridBox = grid.getBoundingClientRect();

  startCell.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
      pointerId: 11,
      pointerType: "mouse",
    })
  );
  startCell.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: gridBox.right - 2,
      clientY: start.y,
      pointerId: 11,
      pointerType: "mouse",
    })
  );

  await rs.waitFor(() => {
    expect(grid.scrollLeft).toBeGreaterThan(0);
  });
  await rs.waitFor(() => {
    expect(selectedCellCount()).toBeGreaterThan(1);
  });

  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 11,
      pointerType: "mouse",
    })
  );
});

test("dragging near the bottom edge auto-scrolls through rows", async () => {
  await renderOrdersGrid(
    "h-[480px] w-[1120px] rounded-2xl border border-border bg-background p-6 text-foreground",
    dataGridFixtureServices({ orderRowCount: 25 })
  );

  await expect
    .element(page.getByText("arun.patel@example.com", { exact: true }))
    .toBeVisible();
  const startCell = gridCellContaining("arun.patel@example.com");
  const grid = document.querySelector<HTMLElement>(".rdg");
  if (!grid) {
    throw new Error("Expected vertical auto-scroll grid elements.");
  }
  expect(grid.scrollHeight).toBeGreaterThan(grid.clientHeight);
  const start = centerOf(startCell);
  const gridBox = grid.getBoundingClientRect();

  startCell.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
      pointerId: 12,
      pointerType: "mouse",
    })
  );
  startCell.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: start.x,
      clientY: start.y,
    })
  );
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: start.x,
      clientY: gridBox.bottom - 2,
      pointerId: 12,
      pointerType: "mouse",
    })
  );

  await rs.waitFor(() => {
    expect(grid.scrollTop).toBeGreaterThan(0);
    expect(selectedCellCount()).toBeGreaterThan(1);
  });

  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 12,
      pointerType: "mouse",
    })
  );
});

async function openForeignKeyReference() {
  const customerLink = page
    .getByRole("button", { name: "Open customer_id reference 214" })
    .first();
  await customerLink.click();
  return customerLink;
}

test("interactive cell actions do not change the cell selection", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  await openForeignKeyReference();

  await expect
    .element(page.getByRole("dialog", { name: "public.customers" }))
    .toBeVisible();
  expect(selectedCellCount()).toBe(0);
});

test("foreign key reference popover keeps the source table visible", async () => {
  await renderOrdersGrid(EXPANDED_GRID_CLASS);

  const customerLink = await openForeignKeyReference();
  const [customerLinkElement] = screen.getAllByRole("button", {
    name: "Open customer_id reference 214",
  });
  if (!customerLinkElement) {
    throw new Error("Expected a customer_id reference trigger.");
  }
  const customerLinkStyle = getComputedStyle(customerLinkElement);
  const frameStyle = getComputedStyle(screen.getByTestId("screenshot-frame"));
  expect(
    colorContrastRatio(customerLinkStyle.color, frameStyle.backgroundColor)
  ).toBeGreaterThanOrEqual(4.5);
  await customerLink.hover();
  const customerLinkHoverStyle = getComputedStyle(customerLinkElement);
  expect(customerLinkHoverStyle.opacity).toBe("1");
  expect(customerLinkHoverStyle.color).not.toBe(frameStyle.color);
  expect(
    colorContrastRatio(customerLinkHoverStyle.color, frameStyle.backgroundColor)
  ).toBeGreaterThanOrEqual(4.5);

  const preview = page.getByRole("dialog", {
    name: "public.customers",
  });
  await expect.element(preview).toBeVisible();
  await preview.hover();
  const previewElement = screen.getByRole("dialog", {
    name: "public.customers",
  });
  expect(previewElement.dataset["slot"]).toBe("popover-content");
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  await expect.element(customerLink).toBeVisible();
  await expect.element(page.getByText("Hanse Container Line")).toBeVisible();
  expect(
    colorContrastRatio(
      getComputedStyle(within(previewElement).getByText("int4")).color,
      getComputedStyle(previewElement).backgroundColor
    )
  ).toBeGreaterThanOrEqual(4.5);
  await expect
    .element(page.getByRole("link", { name: "Open table" }))
    .toBeVisible();
});

test("foreign key reference waits for first-load data before opening", async () => {
  const services = dataGridFixtureServices();
  const { readRows } = services.tableData;
  if (!readRows) {
    throw new Error("Expected the fixture to serve ReadRows.");
  }
  let releaseCustomers: (() => void) | undefined;
  let customersGate = new Promise<void>((resolve) => {
    releaseCustomers = resolve;
  });
  services.tableData.readRows = async (request, context) => {
    if (request.name === CUSTOMERS_TABLE_NAME) {
      await customersGate;
    }
    return readRows(request, context);
  };

  await renderOrdersGrid(EXPANDED_GRID_CLASS, services);

  const trigger = page
    .getByRole("button", { name: "Open customer_id reference 214" })
    .first();
  await trigger.click();

  expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
  await expect.element(trigger).toHaveAttribute("aria-busy", "true");

  releaseCustomers?.();

  await expect
    .element(page.getByRole("dialog", { name: "public.customers" }))
    .toBeVisible();
  await expect.element(trigger).not.toHaveAttribute("aria-busy");

  // Reopening shows the cached row even while a hover refetch never answers.
  customersGate = new Promise<void>(() => undefined);
  await trigger.click();
  await expect
    .element(page.getByRole("dialog", { name: "public.customers" }))
    .toBeDetached();
  await trigger.click();
  await expect
    .element(page.getByRole("dialog", { name: "public.customers" }))
    .toBeVisible();
  await expect.element(trigger).not.toHaveAttribute("aria-busy");
});

test("data value expansion keeps one visible dialog layer", async () => {
  await renderScenario(DataValueDialogGuardScenario);

  const metadataExpand = page.getByRole("button", {
    name: "View full JSON for metadata",
  });
  await expect.element(metadataExpand).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "View full array for tags" }))
    .toBeVisible();
  const tagsExpandElement = screen.getByRole("button", {
    name: "View full array for tags",
  });
  await metadataExpand.click();

  await expect
    .element(page.getByRole("dialog", { name: "metadata JSON" }))
    .toBeVisible();

  // The modal layer blocks pointer input, so click the trigger directly.
  tagsExpandElement.click();

  await expect
    .element(page.getByRole("dialog", { name: "tags array" }))
    .toBeDetached();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
});

test("toolbar shows active sort summary beside the maximize action", async () => {
  await render(
    <ScreenshotFrame>
      <div className="w-[1040px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <DataGridToolbar
          {...columnLayoutProps(resultColumns)}
          {...toolbarHandlers()}
          columns={resultColumns}
          filterLogic="and"
          filterRules={[]}
          isFetching={false}
          onToggleExpanded={rs.fn()}
          selectedCount={0}
          sortColumns={[
            { columnKey: "email", direction: "ASC" },
            { columnKey: "last_seen_at", direction: "DESC" },
          ]}
        />
      </div>
    </ScreenshotFrame>
  );

  const sortSummary = page.getByRole("group", {
    name: "Active sort summary",
  });

  await expect
    .element(page.getByRole("button", { name: "Expand data grid" }))
    .toBeVisible();
  await expect.element(sortSummary).toBeVisible();
  await expect.element(sortSummary.getByText("Sort")).toBeVisible();
  await expect
    .element(sortSummary.getByText("email ASC, last_seen_at DESC"))
    .toBeVisible();

  const maximizeBox = screen
    .getByRole("button", { name: "Expand data grid" })
    .getBoundingClientRect();
  const summaryBox = screen
    .getByRole("group", { name: "Active sort summary" })
    .getBoundingClientRect();
  expect(summaryBox.left).toBeGreaterThanOrEqual(maximizeBox.right);
});

test("row detail drawer wraps dense catalog fields without visual collisions", async () => {
  await renderLongRecordDrawer();

  const titleName =
    "information_schema.sql_implementation_info_with_extra_long_suffix";
  await expect
    .element(page.getByRole("heading", { name: titleName }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Close" }))
    .toBeVisible();
  const titleBox = screen
    .getByRole("heading", { name: titleName })
    .getBoundingClientRect();
  const closeBox = screen
    .getByRole("button", { name: "Close" })
    .getBoundingClientRect();
  expect(titleBox.right).toBeLessThanOrEqual(closeBox.left - 4);

  const rowNavigation = page.getByRole("group", { name: "Row navigation" });
  await expect
    .element(rowNavigation.getByRole("textbox", { name: "Row number" }))
    .toBeVisible();
  await expect
    .element(rowNavigation.getByRole("button", { name: "Previous row number" }))
    .toBeDetached();
  await expect
    .element(rowNavigation.getByRole("button", { name: "Next row number" }))
    .toBeDetached();
  await expect
    .element(
      rowNavigation.getByRole("button", { exact: true, name: "Previous row" })
    )
    .toBeVisible();
  await expect
    .element(
      rowNavigation.getByRole("button", { exact: true, name: "Next row" })
    )
    .toBeVisible();

  await expect
    .element(page.getByRole("button", { name: "Copy character_value" }))
    .toBeDetached();
  await expect.element(page.getByText("Empty string")).toBeVisible();

  const valueBoxes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-slot="record-field-value"]')
  );
  expect(valueBoxes).toHaveLength(5);
  const widths = valueBoxes.map((box) => box.getBoundingClientRect().width);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
});

test("data explorer filter controls keep active predicates visible", async () => {
  await renderScenario(DataGridFilteredToolbarScenario);

  await expect.element(page.getByText("Filtered data explorer")).toBeVisible();
  await expect
    .element(page.getByText("email ILIKE %@enterprise%"))
    .toBeVisible();
  await expect.element(page.getByText("active = true")).toBeVisible();
  await expect.element(page.getByText("OR", { exact: true })).toBeVisible();
});

test("filter popover keeps multiple rules compact and aligned", async () => {
  await renderScenario(DataGridFilteredToolbarScenario);

  await page.getByRole("button", { name: "Filter 2" }).click();
  await expect
    .element(page.getByRole("dialog", { name: "Filter rows" }))
    .toBeVisible();

  const popover = getPopoverBox().element;
  const addFilterBox = screen
    .getByRole("button", { name: "Add filter" })
    .getBoundingClientRect();
  expect(addFilterBox.width).toBeLessThanOrEqual(140);

  const rows = Array.from(popover.querySelectorAll("li"));
  expect(rows).toHaveLength(2);
  const rowBoxes = rows.map((row) => {
    const triggers = row.querySelectorAll<HTMLElement>(
      '[data-slot="select-trigger"]'
    );
    // Boolean columns render a true/false select instead of a text input, so
    // match the value control by its accessible name across both shapes.
    const valueInput = row.querySelector<HTMLElement>(
      '[aria-label="Filter value"]'
    );
    const removeButton = row.querySelector<HTMLElement>(
      'button[aria-label="Remove filter"]'
    );
    const [columnTrigger, operatorTrigger] = triggers;
    if (!(columnTrigger && operatorTrigger && valueInput && removeButton)) {
      throw new Error("expected complete filter row controls");
    }
    return {
      column: columnTrigger.getBoundingClientRect(),
      operator: operatorTrigger.getBoundingClientRect(),
      remove: removeButton.getBoundingClientRect(),
      value: valueInput.getBoundingClientRect(),
    };
  });

  const [first] = rowBoxes;
  if (!first) {
    throw new Error("expected filter row boxes");
  }
  for (const rowBox of rowBoxes.slice(1)) {
    expect(rowBox.column.left).toBeCloseTo(first.column.left, 0);
    expect(rowBox.column.width).toBeCloseTo(first.column.width, 0);
    expect(rowBox.operator.left).toBeCloseTo(first.operator.left, 0);
    expect(rowBox.operator.width).toBeCloseTo(first.operator.width, 0);
    expect(rowBox.value.left).toBeCloseTo(first.value.left, 0);
    expect(rowBox.value.width).toBeCloseTo(first.value.width, 0);
    expect(rowBox.remove.left).toBeCloseTo(first.remove.left, 0);
  }
});

test("filter popover starts with an unapplied rule", async () => {
  await renderScenario(DataGridEmptyFilterToolbarScenario);

  await page.getByRole("button", { name: "Filter" }).click();

  await expect
    .element(page.getByRole("combobox", { name: "Filter column" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Add filter" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Apply" }))
    .toBeVisible();
  expect(getPopoverBox().element).toBeTruthy();
});

test("advanced filter popover shows negation and regex controls", async () => {
  await renderScenario(DataGridAdvancedFilterToolbarScenario);

  await page.getByRole("button", { name: "Filter 1" }).click();

  const filterDialog = page.getByRole("dialog", { name: "Filter rows" });
  await expect.element(filterDialog).toBeVisible();
  const negateButton = page.getByRole("button", { name: "Negate filter" });
  await expect.element(negateButton).toContainText("NOT");
  await expect.element(negateButton).toHaveAttribute("aria-pressed", "true");
  await expect
    .element(filterDialog.getByText("Regex (ignore case)", { exact: true }))
    .toBeVisible();
  const operatorValue = screen
    .getByRole("combobox", { name: "Filter operator" })
    .querySelector<HTMLElement>('[data-slot="select-value"]');
  if (!operatorValue) {
    throw new Error("expected selected operator label");
  }
  expect(operatorValue.scrollWidth).toBeLessThanOrEqual(
    operatorValue.clientWidth
  );
});

test("column popover shows visible-column projection state", async () => {
  await renderScenario(DataGridColumnProjectionToolbarScenario);

  await page.getByRole("button", { name: "Columns" }).click();

  await expect
    .element(page.getByRole("dialog", { name: "Manage columns" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("switch", { name: "Fetch visible columns only" }))
    .toBeChecked();
  await expect
    .element(page.getByRole("checkbox", { name: "metadata" }))
    .toBeUnchecked();
});

test("page size select shows every option when the footer is near the viewport edge", async () => {
  const onPageSizeChange = rs.fn();

  await render(
    <ScreenshotFrame>
      <div className="flex h-[900px] w-[620px] items-end rounded-2xl border border-border bg-background p-6 text-foreground">
        <PaginationFooter
          hasNext={true}
          hasPrev={true}
          onNext={rs.fn()}
          onPageSizeChange={onPageSizeChange}
          onPrev={rs.fn()}
          pageLabel="Page 1"
          pageSize={50}
          pageSizeOptions={HIGH_VOLUME_PAGE_SIZE_OPTIONS}
        />
      </div>
    </ScreenshotFrame>
  );

  // Wait for the trigger to be interactive before clicking: clicking in the
  // same tick as the initial render intermittently lands before the select
  // wires its handlers, leaving the popup closed.
  const pageSizeTrigger = page.getByRole("combobox", { name: "Rows per page" });
  await expect.element(pageSizeTrigger).toBeVisible();
  await pageSizeTrigger.click();
  await expect.element(page.getByRole("listbox")).toBeVisible();

  const selectContent = document.querySelector<HTMLElement>(
    '[data-slot="select-content"]'
  );
  if (!selectContent) {
    throw new Error("expected page size select content");
  }
  // Popup open animations move the options; measure only at rest.
  await Promise.all(
    selectContent.getAnimations().map((animation) => animation.finished)
  );
  const contentBox = selectContent.getBoundingClientRect();

  for (const option of ["25", "50", "100", "250", "500"]) {
    const optionBox = screen
      .getByRole("option", { name: option })
      .getBoundingClientRect();
    expect(optionBox.top).toBeGreaterThanOrEqual(contentBox.top);
    expect(optionBox.bottom).toBeLessThanOrEqual(contentBox.bottom);
  }

  await page.getByRole("option", { exact: true, name: "100" }).click();
  expect(onPageSizeChange).toHaveBeenCalledWith(100);
});

test("filter popover stays inside the data-grid boundary when the grid is offset", async () => {
  await renderScenario(DataGridOffsetFilterToolbarScenario);

  await page.getByRole("button", { name: "Filter 1" }).click();
  await expect
    .element(page.getByRole("dialog", { name: "Filter rows" }))
    .toBeVisible();

  const boundary = getPopoverBoundary();
  const boundaryBox = boundary.getBoundingClientRect();
  const popoverBox = getPopoverBox();
  expect(boundary.contains(popoverBox.element)).toBe(false);
  expect(popoverBox.left).toBeGreaterThanOrEqual(boundaryBox.left - 1);
  expect(popoverBox.right).toBeLessThanOrEqual(boundaryBox.right + 1);

  const filterRow = popoverBox.element.querySelector("li");
  if (!filterRow) {
    throw new Error("expected filter row");
  }
  const rowControls = filterRow.querySelectorAll<HTMLElement>(
    'button, input, [data-slot="select-trigger"]'
  );
  for (const control of rowControls) {
    const controlBox = control.getBoundingClientRect();
    expect(controlBox.left).toBeGreaterThanOrEqual(popoverBox.left - 1);
    expect(controlBox.right).toBeLessThanOrEqual(popoverBox.right + 1);
  }
});

test("sort popover keeps every row control aligned", async () => {
  await renderSortableToolbar();

  await page.getByRole("button", { name: "Sort 5" }).click();
  await expect.element(page.getByText("Sort by")).toBeVisible();

  const popover = getPopoverBox().element;
  const rows = Array.from(popover.querySelectorAll("li"));
  expect(rows).toHaveLength(5);
  const rowBoxes = rows.map((row) => {
    const triggers = row.querySelectorAll<HTMLElement>(
      '[data-slot="select-trigger"]'
    );
    expect(triggers).toHaveLength(2);
    const [columnTrigger, directionTrigger] = triggers;
    if (!(columnTrigger && directionTrigger)) {
      throw new Error("expected sort row controls");
    }
    return {
      column: columnTrigger.getBoundingClientRect(),
      direction: directionTrigger.getBoundingClientRect(),
      row: row.getBoundingClientRect(),
    };
  });

  for (const rowBox of rowBoxes) {
    expect(rowBox.column.width).toBeGreaterThan(80);
    expect(rowBox.direction.width).toBeGreaterThan(60);
    expect(rowBox.column.left).toBeGreaterThan(rowBox.row.left);
    expect(rowBox.direction.left).toBeGreaterThan(rowBox.column.left);
    expect(rowBox.direction.right).toBeLessThanOrEqual(rowBox.row.right + 1);
  }
});

test("sort popover stays inside the data-grid boundary when the grid is offset", async () => {
  await render(
    <ScreenshotFrame>
      <div className="pl-80">
        <div className="w-[560px] rounded-2xl border border-border bg-background p-6 text-foreground">
          <DataGridToolbar
            {...columnLayoutProps(sortableColumns)}
            {...toolbarHandlers()}
            columns={sortableColumns}
            filterLogic="and"
            filterRules={[]}
            isFetching={false}
            selectedCount={0}
            sortColumns={[
              { columnKey: "stat_date", direction: "ASC" },
              { columnKey: "new_customers", direction: "ASC" },
              { columnKey: "page_views", direction: "DESC" },
            ]}
          />
        </div>
      </div>
    </ScreenshotFrame>
  );

  await page.getByRole("button", { name: "Sort 3" }).click();
  await expect.element(page.getByText("Sort by")).toBeVisible();

  const boundary = getPopoverBoundary();
  const boundaryBox = boundary.getBoundingClientRect();
  const popoverBox = getPopoverBox();
  expect(boundary.contains(popoverBox.element)).toBe(false);
  expect(popoverBox.left).toBeGreaterThanOrEqual(boundaryBox.left - 1);
  expect(popoverBox.right).toBeLessThanOrEqual(boundaryBox.right + 1);
});

test("grid status bar exposes actionable warning labels as visible UI", async () => {
  await render(
    <ScreenshotFrame>
      <div className="w-[760px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <GridStatusBar
          items={[
            {
              description:
                "The server shortened this page because the response size limit was reached.",
              id: "response-capped",
              label: "Response capped",
            },
          ]}
        />
      </div>
    </ScreenshotFrame>
  );

  const status = page.getByRole("status", { name: "Grid status" });
  await expect.element(status).toBeVisible();
  await expect.element(status.getByText("Response capped")).toBeVisible();
});

test("data grid refresh treatment is centered and readable", async () => {
  await render(
    <ScreenshotFrame>
      <div className="w-[720px] rounded-2xl border border-border bg-background p-6 text-foreground">
        <GridSurface busy={true} loading={true}>
          <div className="flex min-h-[400px] items-center justify-center rounded-xl border bg-muted/30 text-muted-foreground text-sm">
            Existing rows stay visible behind the refresh treatment.
          </div>
        </GridSurface>
      </div>
    </ScreenshotFrame>
  );

  await expect.element(page.getByTestId("grid-refresh-surface")).toBeVisible();
  const status = page.getByRole("status", { name: "Refreshing data" });
  await expect.element(status).toBeVisible();
  await expect.element(status.getByText("Refreshing rows…")).toBeVisible();
  await expect
    .element(status.getByText("Re-evaluating the visible data set."))
    .toBeVisible();

  const surfaceBox = screen
    .getByTestId("grid-refresh-surface")
    .getBoundingClientRect();
  const statusBox = screen
    .getByRole("status", { name: "Refreshing data" })
    .getBoundingClientRect();
  const surfaceCenterX = surfaceBox.left + surfaceBox.width / 2;
  const surfaceCenterY = surfaceBox.top + surfaceBox.height / 2;
  const statusCenterX = statusBox.left + statusBox.width / 2;
  const statusCenterY = statusBox.top + statusBox.height / 2;

  expect(statusBox.width).toBeGreaterThan(260);
  expect(statusBox.height).toBeGreaterThan(72);
  expect(Math.abs(statusCenterX - surfaceCenterX)).toBeLessThan(2);
  expect(Math.abs(statusCenterY - surfaceCenterY)).toBeLessThan(2);
});

test("selected edge header cell keeps a continuous square border", async () => {
  await renderSelectedHeaderEdgeFixture();

  await expect.element(page.getByText("created_at")).toBeVisible();
  const selectedHeaderStyle = getComputedStyle(screen.getByText("created_at"));
  expect(selectedHeaderStyle.borderTopRightRadius).toBe("0px");
  expect(selectedHeaderStyle.borderBottomRightRadius).toBe("0px");

  const grid = document.querySelector<HTMLElement>(".rdg");
  if (!grid) {
    throw new Error("expected grid fixture");
  }
  expect(getComputedStyle(grid).contain).not.toContain("paint");
});

test("data grid scrollbars use theme colors in dark mode", async () => {
  await renderSelectedHeaderEdgeFixture();
  const wasDark = document.documentElement.classList.contains("dark");
  document.documentElement.classList.add("dark");
  try {
    await expect.element(page.getByText("created_at")).toBeVisible();

    const grid = screen.getByText("created_at").closest<HTMLElement>(".rdg");
    if (!grid) {
      throw new Error("expected grid fixture");
    }
    const style = getComputedStyle(grid);

    const expectedScrollbar = document.createElement("div");
    expectedScrollbar.style.scrollbarColor = `${style.getPropertyValue("--querylane-scrollbar-thumb")} ${style.getPropertyValue("--querylane-scrollbar-track")}`;
    grid.append(expectedScrollbar);
    try {
      // Chromium may interpolate scrollbar colors after a theme change.
      await expect
        .poll(() => getComputedStyle(grid).scrollbarColor)
        .toBe(getComputedStyle(expectedScrollbar).scrollbarColor);
      expect(style.scrollbarColor).not.toBe("auto");
    } finally {
      expectedScrollbar.remove();
    }
    expect(style.scrollbarWidth).toBe("thin");
    expect(style.getPropertyValue("--querylane-scrollbar-thumb")).not.toBe("");
    expect(style.getPropertyValue("--querylane-scrollbar-track")).not.toBe("");
  } finally {
    document.documentElement.classList.toggle("dark", wasDark);
  }
});

test("data grid values remain selectable while headers stay non-selectable", async () => {
  await render(
    <ScreenshotFrame>
      <div className="rdg">
        <div className="rdg-header-row">
          <div className="rdg-cell" data-testid="header-cell">
            name
          </div>
        </div>
        <div className="rdg-row">
          <div className="rdg-cell" data-testid="data-cell">
            <span data-testid="data-cell-text">Laptop Pro 15</span>
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );

  await expect.element(page.getByTestId("data-cell-text")).toBeVisible();

  const dataCell = screen.getByTestId("data-cell");
  expect(getComputedStyle(dataCell).userSelect).toBe("text");
  expect(
    getComputedStyle(screen.getByTestId("data-cell-text")).userSelect
  ).toBe("text");
  expect(getComputedStyle(dataCell).cursor).toBe("default");
  expect(getComputedStyle(screen.getByTestId("header-cell")).userSelect).toBe(
    "none"
  );
});

test("narrow column headers keep the options menu visible", async () => {
  await render(
    <ScreenshotFrame>
      <div className="rounded-2xl border border-border bg-background p-6 text-foreground">
        <div
          className="h-9 w-[104px] overflow-hidden rounded-md border border-border"
          data-testid="narrow-column-header"
        >
          <ColumnHeader
            canHide={true}
            column={column("aggfnoid", "regproc", DataType.STRING)}
            isFrozen={false}
            isPrimaryKey={true}
            onCopyName={rs.fn()}
            onHide={rs.fn()}
            onSortAsc={rs.fn()}
            onSortDesc={rs.fn()}
            onToggleFreeze={rs.fn()}
          />
        </div>
      </div>
    </ScreenshotFrame>
  );

  const menuButton = page.getByRole("button", {
    name: "Open options for column aggfnoid",
  });
  await expect.element(menuButton).toBeVisible();

  const headerBox = screen
    .getByTestId("narrow-column-header")
    .getBoundingClientRect();
  const buttonBox = screen
    .getByRole("button", { name: "Open options for column aggfnoid" })
    .getBoundingClientRect();

  expect(buttonBox.left).toBeGreaterThanOrEqual(headerBox.left);
  expect(buttonBox.right).toBeLessThanOrEqual(headerBox.right);

  await menuButton.click();
  await expect.element(page.getByText("Sort ascending")).toBeVisible();

  const menu = document.querySelector<HTMLElement>(
    '[data-slot="dropdown-menu-content"]'
  );
  if (!menu) {
    throw new Error("expected column menu");
  }
  expect(menu.textContent).toContain("regproc");
});
