import { create as createProto } from "@bufbuild/protobuf";
import { type Locator, page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, rs, test } from "@rstest/core";
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

// Disabled controls cannot receive pointer events, so the tooltip hangs off
// the nearest tooltip trigger: either the control itself or its wrapper.
async function hoverTooltipTrigger(control: Locator) {
  const tooltipTrigger = page.locator('[data-slot="tooltip-trigger"]');
  await tooltipTrigger
    .filter({ has: control })
    .or(tooltipTrigger.and(control))
    .last()
    .hover();
}

test("explains why the last visible column cannot be hidden", async () => {
  const idColumn = column("id");
  await render(
    <ColumnsPopover
      columnOrder={["id"]}
      columns={[idColumn]}
      fetchVisibleColumns={false}
      hiddenColumnKeys={new Set()}
      isCustomized={false}
      onFetchVisibleColumnsChange={rs.fn()}
      onOrderChange={rs.fn()}
      onReset={rs.fn()}
      onVisibilityChange={rs.fn()}
    />
  );

  await page.getByRole("button", { name: "Columns" }).click();
  const checkbox = page.getByRole("checkbox", { name: "id" });
  await expect.element(checkbox).toBeDisabled();
  await hoverTooltipTrigger(checkbox);

  await expect
    .element(page.getByText("At least one column must remain visible.").last())
    .toBeVisible();
});

test("explains why the last visible column cannot be hidden from its menu", async () => {
  await render(
    <ColumnHeaderMenu
      canHide={false}
      columnName="id"
      columnRawType="text"
      isFrozen={false}
      onCopyName={rs.fn()}
      onHide={rs.fn()}
      onSortAsc={rs.fn()}
      onSortDesc={rs.fn()}
      onToggleFreeze={rs.fn()}
    />
  );

  await page
    .getByRole("button", { name: "Open options for column id" })
    .click();
  const hideColumn = page.getByRole("menuitem", { name: "Hide column" });
  await expect.element(hideColumn).toHaveAttribute("aria-disabled", "true");
  await hoverTooltipTrigger(hideColumn);

  await expect
    .element(page.getByText("At least one column must remain visible.").last())
    .toBeVisible();
});

test("explains why another sort column cannot be added", async () => {
  const columns = Array.from({ length: MAX_SORT_COLUMNS }, (_, index) =>
    column(`column_${index + 1}`)
  );
  await render(
    <SortPopover
      columns={columns}
      onChange={rs.fn()}
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
  await hoverTooltipTrigger(addSortColumn);

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
  await render(
    <SortPopover
      columns={[idColumn]}
      onChange={rs.fn()}
      sortColumns={[{ columnKey: "id", direction: "ASC" }]}
    />
  );

  await page.getByRole("button", { name: "Sort 1" }).click();
  const addSortColumn = page.getByRole("combobox", {
    name: "Add sort column",
  });
  await hoverTooltipTrigger(addSortColumn);

  await expect
    .element(page.getByText("Every available column is already sorted.").last())
    .toBeVisible();
});

test("explains why another filter rule cannot be added", async () => {
  const rules = Array.from({ length: MAX_FILTER_RULES }, (_, index) => ({
    ...createFilterRule("id"),
    id: `filter-${index + 1}`,
  }));
  await render(
    <FilterPopover
      columns={[column("id")]}
      logic="and"
      onChange={rs.fn()}
      rules={rules}
    />
  );

  await page
    .getByRole("button", { name: `Filter ${MAX_FILTER_RULES}` })
    .click();
  const addFilter = page.getByRole("button", { name: "Add filter" });
  await expect.element(addFilter).toBeDisabled();
  await hoverTooltipTrigger(addFilter);

  await expect
    .element(
      page
        .getByText(`You can add up to ${MAX_FILTER_RULES} filter rules.`)
        .last()
    )
    .toBeVisible();
});

test("explains when no columns are available to filter", async () => {
  await render(
    <FilterPopover columns={[]} logic="and" onChange={rs.fn()} rules={[]} />
  );

  await page.getByRole("button", { name: "Filter" }).click();
  const addFilter = page.getByRole("button", { name: "Add filter" });
  await hoverTooltipTrigger(addFilter);

  await expect
    .element(page.getByText("No columns are available to filter.").last())
    .toBeVisible();
});
