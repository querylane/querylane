import { create } from "@bufbuild/protobuf";
import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { TableDetail } from "@/features/data-explorer/explorer-table-detail";
import { TableDataService } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import {
  GetTablePartitionMetadataResponseSchema,
  ListTableIndexesResponseSchema,
  ListTablePoliciesResponseSchema,
  ListTableTriggersResponseSchema,
  TableService,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import { dataGridFixtureServices } from "@/test/fixtures/data-grid-fixtures";
import { createTestRouterTransport } from "@/test/router-transport";
import { HarnessProviders } from "@/visual-harness/harness-providers";

import "@/components/data-grid/table-data-grid/data-grid-theme.css";

test("table detail uses available height while keeping 500-row pages virtualized", async () => {
  const services = dataGridFixtureServices({ orderRowCount: 500 });
  const transport = createTestRouterTransport((router) => {
    router.service(TableService, {
      ...services.table,
      getTablePartitionMetadata: () =>
        create(GetTablePartitionMetadataResponseSchema),
      listTableIndexes: () => create(ListTableIndexesResponseSchema),
      listTablePolicies: () => create(ListTablePoliciesResponseSchema),
      listTableTriggers: () => create(ListTableTriggersResponseSchema),
    });
    router.service(TableDataService, services.tableData);
  });

  await render(
    <HarnessProviders transport={transport}>
      <ScreenshotFrame>
        <div className="flex h-[1600px] w-[1120px] flex-col rounded-2xl border border-border bg-background p-6 text-foreground">
          <TableDetail
            databaseId="appdb"
            instanceId="production"
            schemaName="public"
            table={undefined}
            tableName="orders"
          />
        </div>
      </ScreenshotFrame>
    </HarnessProviders>
  );

  await expect.element(page.getByText("arun.patel@example.com")).toBeVisible();
  expect(
    document.querySelector(".rdg")?.getBoundingClientRect().height ?? 0
  ).toBeGreaterThan(1100);
  await expect
    .poll(() => document.querySelectorAll(".rdg .rdg-row").length)
    .toBeLessThanOrEqual(60);
  expect(
    document.querySelectorAll(".rdg .rdg-cell").length
  ).toBeLessThanOrEqual(420);
  await expect
    .element(page.getByText("customer.500@example.com"))
    .toBeDetached();
});
