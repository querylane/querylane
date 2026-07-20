import { create as createProto } from "@bufbuild/protobuf";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { ColumnHeaderMenu } from "@/components/data-grid/table-data-grid/column-header-menu";
import { ColumnsPopover } from "@/components/data-grid/table-data-grid/columns-popover";
import { FilterPopover } from "@/components/data-grid/table-data-grid/filter-popover";
import { SortPopover } from "@/components/data-grid/table-data-grid/sort-popover";
import {
  createFilterRule,
  MAX_FILTER_RULES,
} from "@/features/data-explorer/table-data/filter-state";
import { MAX_SORT_COLUMNS } from "@/features/data-explorer/table-data/use-table-data-controller";
import {
  type TableResultColumn,
  TableResultColumnSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

function column(name: string): TableResultColumn {
  return createProto(TableResultColumnSchema, {
    columnName: name,
    dataType: DataType.STRING,
    rawType: "text",
  });
}

async function hoverTooltipTrigger(element: Element) {
  const tooltipTrigger = element.closest('[data-slot="tooltip-trigger"]');
  if (!(tooltipTrigger instanceof HTMLElement)) {
    throw new Error("Expected disabled control tooltip trigger");
  }
  await page.elementLocator(tooltipTrigger).hover();
}

afterEach(async () => {
  await cleanup();
});

test("explains why the last visible column cannot be hidden", async () => {
  const idColumn = column("id");
  render(
    <ColumnsPopover
      columnOrder={["id"]}
      columns={[idColumn]}
      hiddenColumnKeys={new Set()}
      isCustomized={false}
      onOrderChange={vi.fn()}
      onReset={vi.fn()}
      onVisibilityChange={vi.fn()}
    />
  );

  await page.getByRole("button", { name: "Columns" }).click();
  const checkbox = page.getByRole("checkbox", { name: "id" });
  await expect.element(checkbox).toBeDisabled();
  await hoverTooltipTrigger(checkbox.element());

  await expect
    .element(page.getByText("At least one column must remain visible.").last())
    .toBeVisible();
});

test("explains why the last visible column cannot be hidden from its menu", async () => {
  render(
    <ColumnHeaderMenu
      canHide={false}
      columnName="id"
      columnRawType="text"
      isFrozen={false}
      onCopyName={vi.fn()}
      onHide={vi.fn()}
      onSortAsc={vi.fn()}
      onSortDesc={vi.fn()}
      onToggleFreeze={vi.fn()}
    />
  );

  await page
    .getByRole("button", { name: "Open options for column id" })
    .click();
  const hideColumn = page.getByRole("menuitem", { name: "Hide column" });
  await expect.element(hideColumn).toHaveAttribute("aria-disabled", "true");
  await hoverTooltipTrigger(hideColumn.element());

  await expect
    .element(page.getByText("At least one column must remain visible.").last())
    .toBeVisible();
});

test("explains why another sort column cannot be added", async () => {
  const columns = Array.from({ length: MAX_SORT_COLUMNS }, (_, index) =>
    column(`column_${index + 1}`)
  );
  render(
    <SortPopover
      columns={columns}
      onChange={vi.fn()}
      sortColumns={columns.map((item) => ({
        columnKey: item.columnName,
        direction: "ASC",
      }))}
    />
  );

  await page.getByRole("button", { name: `Sort ${MAX_SORT_COLUMNS}` }).click();
  const addSortColumn = page.getByRole("combobox", {
    name: "Add sort column",
  });
  await expect.element(addSortColumn).toBeDisabled();
  await hoverTooltipTrigger(addSortColumn.element());

  await expect
    .element(
      page
        .getByText(`You can sort by up to ${MAX_SORT_COLUMNS} columns.`)
        .last()
    )
    .toBeVisible();
});

test("explains when every available column is already sorted", async () => {
  const idColumn = column("id");
  render(
    <SortPopover
      columns={[idColumn]}
      onChange={vi.fn()}
      sortColumns={[{ columnKey: "id", direction: "ASC" }]}
    />
  );

  await page.getByRole("button", { name: "Sort 1" }).click();
  const addSortColumn = page.getByRole("combobox", {
    name: "Add sort column",
  });
  await hoverTooltipTrigger(addSortColumn.element());

  await expect
    .element(page.getByText("Every available column is already sorted.").last())
    .toBeVisible();
});

test("explains why another filter rule cannot be added", async () => {
  const rules = Array.from({ length: MAX_FILTER_RULES }, (_, index) => ({
    ...createFilterRule("id"),
    id: `filter-${index + 1}`,
  }));
  render(
    <FilterPopover
      columns={[column("id")]}
      logic="and"
      onChange={vi.fn()}
      rules={rules}
    />
  );

  await page
    .getByRole("button", { name: `Filter ${MAX_FILTER_RULES}` })
    .click();
  const addFilter = page.getByRole("button", { name: "Add filter" });
  await expect.element(addFilter).toBeDisabled();
  await hoverTooltipTrigger(addFilter.element());

  await expect
    .element(
      page
        .getByText(`You can add up to ${MAX_FILTER_RULES} filter rules.`)
        .last()
    )
    .toBeVisible();
});

test("explains when no columns are available to filter", async () => {
  render(
    <FilterPopover columns={[]} logic="and" onChange={vi.fn()} rules={[]} />
  );

  await page.getByRole("button", { name: "Filter" }).click();
  const addFilter = page.getByRole("button", { name: "Add filter" });
  await hoverTooltipTrigger(addFilter.element());

  await expect
    .element(page.getByText("No columns are available to filter.").last())
    .toBeVisible();
});
