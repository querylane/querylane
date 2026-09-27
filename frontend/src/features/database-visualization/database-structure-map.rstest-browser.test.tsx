import { page } from "@rstest/browser";
import { render } from "@rstest/browser-react";
import { expect, test } from "@rstest/core";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { useDatabaseVisualizationStore } from "@/features/database-visualization/database-visualization-store";
import { DatabaseStructureMapScenario } from "@/visual-harness/structure-map-scenarios";

// Pixels live in e2e/visual/explorer-states.spec.ts, which opens the same
// scenario through the visual harness.
test("expanded database structure map stays readable for dense table metadata", async () => {
  useDatabaseVisualizationStore.setState({
    databaseSelectedNodeId: null,
    detailScope: "selected-schema",
    direction: "LR",
  });

  await render(
    <ScreenshotFrame>
      <DatabaseStructureMapScenario />
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByText("orders_tenant_read_policy"))
    .toBeVisible();
  await page.getByRole("button", { name: "Resource filters" }).click();
  await page.getByRole("button", { name: "Show all resources" }).click();
  await page.getByRole("button", { name: "Expand database map" }).click();

  const dialog = page.getByRole("dialog", { name: "Expanded database map" });
  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("orders_account_id_fkey"))
    .toBeVisible();
  await expect.element(dialog.getByText("orders_audit_trigger")).toBeVisible();
  await expect
    .element(dialog.getByText("orders_metadata_gin_idx"))
    .toBeVisible();
  await expect
    .element(dialog.getByText("orders_tenant_read_policy"))
    .toBeVisible();
});
