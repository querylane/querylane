import { create } from "@bufbuild/protobuf";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { SqlResultsGrid } from "@/features/sql-workbench/sql-results-grid";
import {
  TableCellSchema,
  TableResultColumnSchema,
  TableResultRowSchema,
} from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { BrowserSurface } from "@/test/browser-surface.test-utils";
import "@/components/data-grid/table-data-grid/data-grid-theme.css";

function textColumn(columnName: string) {
  return create(TableResultColumnSchema, {
    columnName,
    dataType: DataType.STRING,
    rawType: "text",
  });
}

function textCell(value: string) {
  return create(TableCellSchema, {
    value: { kind: { case: "stringValue", value } },
  });
}

test("query columns are display-only and duplicate names remain independently selectable", async () => {
  await render(
    <BrowserSurface>
      <div className="flex h-[400px] w-[800px] flex-col">
        <SqlResultsGrid
          columns={[textColumn("id"), textColumn("id")]}
          resultKey="run-1"
          rows={[
            create(TableResultRowSchema, {
              rowKey: "one",
              values: [textCell("left"), textCell("right")],
            }),
          ]}
        />
      </div>
    </BrowserSurface>
  );
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "id#1", exact: true })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "id", exact: true })
    .press("Escape");
  await expect.element(page.getByText("left", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("right", { exact: true }))
    .not.toBeVisible();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reset columns" }).click();
  await expect.element(page.getByText("right", { exact: true })).toBeVisible();
});

test("query rows sort by received values independently of column visibility", async () => {
  await render(
    <BrowserSurface>
      <div className="flex h-[400px] w-[800px] flex-col">
        <SqlResultsGrid
          columns={[textColumn("id"), textColumn("owner")]}
          resultKey="run-sort"
          rows={[
            create(TableResultRowSchema, {
              rowKey: "one",
              values: [textCell("alpha"), textCell("first owner")],
            }),
            create(TableResultRowSchema, {
              rowKey: "two",
              values: [textCell("zebra"), textCell("last owner")],
            }),
          ]}
        />
      </div>
    </BrowserSurface>
  );
  const grid = page.getByRole("grid");
  await expect
    .element(grid.getByRole("row").nth(1).getByText("alpha", { exact: true }))
    .toBeVisible();
  await page
    .getByRole("button", { name: "Open options for column id" })
    .click();
  await page.getByRole("menuitemcheckbox", { name: "Sort descending" }).click();
  await expect
    .element(grid.getByRole("row").nth(1).getByText("zebra", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "owner", exact: true })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "id", exact: true })
    .press("Escape");
  await expect
    .element(grid.getByRole("row").nth(1).getByText("zebra", { exact: true }))
    .toBeVisible();
  await expect
    .element(grid.getByText("last owner", { exact: true }))
    .not.toBeVisible();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reset columns" }).click();
  await expect
    .element(
      grid.getByRole("row").nth(1).getByText("last owner", { exact: true })
    )
    .toBeVisible();
});
