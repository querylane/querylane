import { create } from "@bufbuild/protobuf";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { SqlResultsGrid } from "@/features/sql-workbench/sql-results-grid";
import { TableResultRowSchema } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { gridCell, gridColumn } from "@/visual-harness/data-grid-scenario-data";
import "@/components/data-grid/table-data-grid/data-grid-theme.css";

test("query columns are display-only and duplicate names remain independently selectable", async () => {
  await render(
    <ScreenshotFrame>
      <div className="flex h-[400px] w-[800px] flex-col">
        <SqlResultsGrid
          columns={[
            gridColumn("id", "text", DataType.STRING),
            gridColumn("id", "text", DataType.STRING),
          ]}
          resultKey="run-1"
          rows={[
            create(TableResultRowSchema, {
              rowKey: "one",
              values: [
                gridCell({ case: "stringValue", value: "left" }),
                gridCell({ case: "stringValue", value: "right" }),
              ],
            }),
          ]}
        />
      </div>
    </ScreenshotFrame>
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
