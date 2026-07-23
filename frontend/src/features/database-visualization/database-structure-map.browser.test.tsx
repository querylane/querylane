import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { DatabaseStructureMap } from "@/features/database-visualization/database-structure-map";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/features/database-visualization/structure-map-data", () => ({
  useStructureMapData: () => ({
    error: null,
    hasPartialData: false,
    inspectedTableCount: 2,
    isLoading: false,
    schemas: [{ id: "public", name: "public", owner: "app_owner" }],
    tableCount: 2,
    tables: [
      {
        columns: [
          {
            columnName: "order_id",
            isNullable: false,
            isPrimaryKey: true,
            rawType: "uuid",
          },
          {
            columnName: "account_id",
            isNullable: false,
            isPrimaryKey: false,
            rawType: "uuid",
          },
          {
            columnName: "status",
            isNullable: false,
            isPrimaryKey: false,
            isUnique: true,
            rawType: "text",
          },
          {
            columnName: "metadata",
            isNullable: true,
            isPrimaryKey: false,
            rawType: "jsonb",
          },
          {
            columnName: "submitted_at",
            isNullable: false,
            isPrimaryKey: false,
            rawType: "timestamp with time zone",
          },
          {
            columnName: "approved_by_role_ids",
            isNullable: false,
            isPrimaryKey: false,
            rawType: "uuid[]",
          },
        ],
        constraints: [
          {
            columnNames: ["order_id"],
            constraintName: "orders_pkey",
            referencedColumnNames: [],
            referencedTable: "",
            type: "primary_key",
          },
          {
            columnNames: ["account_id"],
            constraintName: "orders_account_id_fkey",
            referencedColumnNames: ["account_id"],
            referencedTable:
              "instances/prod/databases/app/schemas/public/tables/accounts",
            type: "foreign_key",
          },
          {
            columnNames: ["status"],
            constraintName: "orders_status_check",
            referencedColumnNames: [],
            referencedTable: "",
            type: "check",
          },
          {
            columnNames: ["account_id", "submitted_at"],
            constraintName: "orders_account_submitted_unique",
            referencedColumnNames: [],
            referencedTable: "",
            type: "unique",
          },
        ],
        indexes: [
          {
            indexName: "orders_account_status_submitted_idx",
            isUnique: false,
            keyColumns: ["account_id", "status", "submitted_at"],
            method: "btree",
          },
          {
            indexName: "orders_metadata_gin_idx",
            isUnique: false,
            keyColumns: ["metadata"],
            method: "gin",
          },
        ],
        policies: [
          {
            command: "SELECT",
            policyName: "orders_tenant_read_policy",
            roles: ["app_reader", "support_agent"],
          },
          {
            command: "UPDATE",
            policyName: "orders_status_write_policy",
            roles: ["app_writer"],
          },
        ],
        schemaName: "public",
        tableName: "orders",
        triggers: [
          {
            enabled: true,
            events: ["INSERT", "UPDATE"],
            functionName: "audit_order_changes",
            timing: "AFTER",
            triggerName: "orders_audit_trigger",
          },
          {
            enabled: false,
            events: ["UPDATE"],
            functionName: "sync_order_search_index",
            timing: "AFTER",
            triggerName: "orders_search_sync_trigger",
          },
        ],
      },
      {
        columns: [
          {
            columnName: "account_id",
            isNullable: false,
            isPrimaryKey: true,
            rawType: "uuid",
          },
        ],
        constraints: [],
        indexes: [],
        policies: [],
        schemaName: "public",
        tableName: "accounts",
        triggers: [],
      },
    ],
    truncatedReason: null,
    views: [],
  }),
}));

function renderComplexDatabaseMap() {
  render(
    <ScreenshotFrame>
      <div className="h-[900px] w-[1180px] overflow-hidden rounded-2xl border border-border bg-background p-5 text-foreground">
        <DatabaseStructureMap
          activeSchemaName="public"
          databaseId="app"
          databaseLabel="app"
          instanceId="prod"
          targetResource={{
            category: "tables",
            name: "orders",
            schemaName: "public",
          }}
        />
      </div>
    </ScreenshotFrame>
  );
}

test("expanded database structure map stays readable for dense table metadata", async () => {
  renderComplexDatabaseMap();

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

  await expect(dialog).toMatchScreenshot(
    "database-structure-map-complex-expanded",
    {
      comparatorOptions: {
        allowedMismatchedPixelRatio: 0.05,
      },
    }
  );
});
