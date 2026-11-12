import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { ViewDetail } from "@/features/data-explorer/explorer-view-detail";
import { TableDataService } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { TableService } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { ViewService } from "@/protogen/querylane/console/v1alpha1/view_pb";
import {
  MATERIALIZED_VIEW,
  MATERIALIZED_VIEW_ID,
  materializedViewServices,
} from "@/test/fixtures/explorer-states-fixtures";
import { createTestRouterTransport } from "@/test/router-transport";
import { HarnessProviders } from "@/visual-harness/harness-providers";

test("materialized view data tab renders its real grid", async () => {
  const services = materializedViewServices();
  const transport = createTestRouterTransport((router) => {
    router.service(TableService, services.table);
    router.service(TableDataService, services.tableData);
    router.service(ViewService, services.view);
  });

  await render(
    <HarnessProviders transport={transport}>
      <ScreenshotFrame>
        <div className="h-[820px] w-[1180px] rounded-2xl border border-border bg-background p-8 text-foreground">
          <ViewDetail
            databaseId="appdb"
            instanceId="production"
            schemaName="public"
            view={MATERIALIZED_VIEW}
            viewName={MATERIALIZED_VIEW_ID}
          />
        </div>
      </ScreenshotFrame>
    </HarnessProviders>
  );

  await expect
    .element(
      page.getByRole("heading", {
        name: "public.customer_success_daily_rollups",
      })
    )
    .toBeVisible();
  // ReadRows answers only the view's own resource name.
  await expect.element(page.getByText("Northwind Labs")).toBeVisible();
});
