import { create as createProto } from "@bufbuild/protobuf";
import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { SchemaDetail } from "@/features/data-explorer/explorer-schema-detail";
import {
  type OtherDatabaseObject,
  OtherDatabaseObjectsPanel,
} from "@/features/data-explorer/other-database-objects-section";
import { TableSchema } from "@/protogen/querylane/console/v1alpha1/table_pb";
import { ViewSchema } from "@/protogen/querylane/console/v1alpha1/view_pb";

const otherObjectsQuery = vi.hoisted(() => ({
  data: undefined as
    | { isTruncated: boolean; objects: OtherDatabaseObject[] }
    | undefined,
  error: null as Error | null,
  isLoading: false,
  refetch: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/features/data-explorer/other-database-objects-query", () => ({
  useOtherDatabaseObjectsQuery: () => otherObjectsQuery,
}));

const CREATE_SHIPMENT_STATUS_RE = /CREATE TYPE shipping\.shipment_status/;
const LOCK_TIMEOUT_RE = /lock timeout · 29 Jun 05:00/;
const NEXT_RUNS_RE = /next runs:/;
const PARTMAN_MAINTENANCE_RE = /partman-maintenance/;
const SHIPMENT_STATUS_BUTTON_RE = /shipping\.shipment_status/;

const designObjects: OtherDatabaseObject[] = [
  {
    badge: "ENUM",
    category: "types",
    definition:
      "CREATE TYPE shipping.shipment_status AS ENUM ('booked', 'in_transit', 'customs_hold', 'delayed', 'delivered', 'cancelled');",
    detail: "",
    extra: "used by shipping.shipments.status",
    name: "shipping.shipment_status",
    sortKey: "1",
    summary:
      "booked · in_transit · customs_hold · delayed · delivered · cancelled",
    values: [
      "booked",
      "in_transit",
      "customs_hold",
      "delayed",
      "delivered",
      "cancelled",
    ],
  },
  {
    badge: "DOMAIN",
    category: "types",
    definition:
      "CREATE DOMAIN shipping.weight_class AS numeric CHECK (VALUE > 0 AND VALUE < 100000);",
    detail: "",
    name: "shipping.weight_class",
    sortKey: "2",
    summary: "numeric CHECK (VALUE > 0 AND VALUE < 100000)",
  },
  {
    badge: "COMPOSITE",
    category: "types",
    definition:
      "CREATE TYPE catalog.port_ref AS (code text, name text, tz text);",
    detail: "",
    name: "catalog.port_ref",
    sortKey: "3",
    summary: "(code text, name text, tz text)",
  },
];

const designJobObjects: OtherDatabaseObject[] = [
  {
    badge: "pg_cron",
    category: "cronJobs",
    definition:
      "SELECT cron.schedule('partman-maintenance', '0 3 * * *', $$CALL partman.run_maintenance_proc()$$);",
    detail: "CALL partman.run_maintenance_proc()",
    extra: "4.2 s · 5 Jul 03:00",
    name: "partman-maintenance",
    sortKey: "partman-maintenance",
    status: "ok",
    summary: "0 3 * * * · postgres · app",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    definition:
      "SELECT cron.schedule('refresh-carrier-volume', '10 3 * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY shipping.mv_carrier_volume$$);",
    detail: "REFRESH MATERIALIZED VIEW CONCURRENTLY shipping.mv_carrier_volume",
    extra: "4.2 s · 5 Jul 03:10",
    name: "refresh-carrier-volume",
    sortKey: "refresh-carrier-volume",
    status: "ok",
    summary: "10 3 * * * · postgres · app",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    definition:
      "SELECT cron.schedule('stats-snapshot', '*/15 * * * *', $$INSERT INTO ops.stat_snapshots SELECT …$$);",
    detail: "INSERT INTO ops.stat_snapshots SELECT …",
    extra: "0.3 s · 5 Jul 01:45",
    name: "stats-snapshot",
    sortKey: "stats-snapshot",
    status: "ok",
    summary: "*/15 * * * * · postgres · app",
  },
  {
    badge: "pg_cron",
    category: "cronJobs",
    definition:
      "SELECT cron.schedule('vacuum-audit-log', '0 5 * * 0', $$VACUUM (ANALYZE) audit.change_log$$);",
    detail: "VACUUM (ANALYZE) audit.change_log",
    extra: "lock timeout · 29 Jun 05:00",
    name: "vacuum-audit-log",
    sortKey: "vacuum-audit-log",
    status: "failed",
    summary: "0 5 * * 0 · postgres · app",
  },
];

function renderPanel(objects = designObjects) {
  render(
    <ScreenshotFrame>
      <div className="w-[1060px] rounded-2xl border border-border bg-background p-8 text-foreground">
        <OtherDatabaseObjectsPanel isLoading={false} objects={objects} />
      </div>
    </ScreenshotFrame>
  );
}

function renderSchemaOverview() {
  otherObjectsQuery.data = {
    isTruncated: false,
    objects: designObjects,
  };
  render(
    <ScreenshotFrame>
      <div className="w-[900px] rounded-2xl border border-border bg-background p-8 text-foreground">
        <SchemaDetail
          databaseId="app"
          instanceId="prod"
          onSelectTable={() => undefined}
          onSelectView={() => undefined}
          owner="data_platform"
          schemaName="shipping"
          tables={[
            createProto(TableSchema, {
              displayName: "shipments",
              name: "shipments",
              owner: "data_platform",
              rowCount: 84_200n,
              sizeBytes: 42_000_000n,
            }),
          ]}
          tablesError={null}
          tablesLoading={false}
          views={[
            createProto(ViewSchema, {
              displayName: "active_shipments",
              name: "active_shipments",
              owner: "analytics_owner",
              rowCount: 12_400n,
              sizeBytes: 0n,
            }),
          ]}
          viewsError={null}
          viewsLoading={false}
        />
      </div>
    </ScreenshotFrame>
  );
}

test("schema overview keeps search and filters above the new inventory", async () => {
  renderSchemaOverview();

  await expect
    .element(page.getByRole("heading", { name: "shipping" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: "Search objects…" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Kind" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Owner" }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole("searchbox", {
        name: "Search other database objects",
      })
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Category" }))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-schema-overview-other-database-objects"
  );
});

test("other database objects matches the design's compact type inventory", async () => {
  renderPanel();

  await expect
    .element(page.getByRole("heading", { name: "Other database objects" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Category" }))
    .toBeVisible();
  const search = page
    .getByRole("searchbox", { name: "Search other database objects" })
    .element();
  const categoryFilter = page
    .getByRole("button", { name: "Category" })
    .element();
  expect(search.getBoundingClientRect().left).toBeLessThan(
    categoryFilter.getBoundingClientRect().left
  );
  expect(
    Math.abs(
      search.getBoundingClientRect().top -
        categoryFilter.getBoundingClientRect().top
    )
  ).toBeLessThanOrEqual(1);
  await expect
    .element(page.getByText("shipping.shipment_status"))
    .toBeVisible();
  await expect.element(page.getByText("shipping.weight_class")).toBeVisible();
  await expect.element(page.getByText("catalog.port_ref")).toBeVisible();
  await expect.element(page.getByText("CREATE TYPE")).not.toBeInTheDocument();

  await page.getByRole("button", { name: SHIPMENT_STATUS_BUTTON_RE }).click();

  await expect.element(page.getByText(CREATE_SHIPMENT_STATUS_RE)).toBeVisible();
  await expect
    .element(page.getByText("used by shipping.shipments.status"))
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-other-database-objects-types"
  );
});

test("other database objects keeps its filter layout stable while loading", async () => {
  render(
    <ScreenshotFrame>
      <div className="w-[1060px] rounded-2xl border border-border bg-background p-8 text-foreground">
        <OtherDatabaseObjectsPanel isLoading={true} objects={[]} />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(
      page.getByRole("status", { name: "Loading other database objects" })
    )
    .toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-other-database-objects-loading"
  );
});

test("other database objects matches the design's pg cron run history view", async () => {
  renderPanel(designJobObjects);

  await expect
    .element(page.getByRole("button", { name: "Category" }))
    .toBeVisible();
  await expect.element(page.getByText("partman-maintenance")).toBeVisible();
  await expect.element(page.getByText("vacuum-audit-log")).toBeVisible();
  await expect.element(page.getByText(LOCK_TIMEOUT_RE)).toBeVisible();

  await page.getByRole("button", { name: PARTMAN_MAINTENANCE_RE }).click();

  await expect.element(page.getByText("Minute")).toBeVisible();
  await expect.element(page.getByText("“At 03:00, every day”")).toBeVisible();
  await expect.element(page.getByText(NEXT_RUNS_RE)).not.toBeInTheDocument();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-other-database-objects-pg-cron"
  );
});
