import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import {
  type OtherDatabaseObject,
  OtherDatabaseObjectsPanel,
} from "@/features/data-explorer/other-database-objects-section";

const CREATE_SHIPMENT_STATUS_RE = /CREATE TYPE shipping\.shipment_status/;
const JOBS_CATEGORY_RE = /^Jobs · pg_cron 4$/;
const PARTMAN_MAINTENANCE_RE = /partman-maintenance/;
const SHIPMENT_STATUS_BUTTON_RE = /shipping\.shipment_status/;
const TYPES_CATEGORY_RE = /^Types 3$/;

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
    extra: "ok · 4.2 s · 5 Jul 03:00",
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
    extra: "ok · 4.2 s · 5 Jul 03:10",
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
    extra: "ok · 0.3 s · 5 Jul 01:45",
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
    extra: "failed · lock timeout · 29 Jun 05:00",
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

test("other database objects matches the design's compact type inventory", async () => {
  renderPanel();

  await expect
    .element(page.getByRole("heading", { name: "Other database objects" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: TYPES_CATEGORY_RE }))
    .toHaveAttribute("aria-current", "page");
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

test("other database objects matches the design's pg cron run history view", async () => {
  renderPanel(designJobObjects);

  await expect
    .element(page.getByRole("button", { name: JOBS_CATEGORY_RE }))
    .toHaveAttribute("aria-current", "page");
  await expect.element(page.getByText("partman-maintenance")).toBeVisible();
  await expect.element(page.getByText("vacuum-audit-log")).toBeVisible();
  await expect
    .element(page.getByText("failed · lock timeout · 29 Jun 05:00"))
    .toBeVisible();

  await page.getByRole("button", { name: PARTMAN_MAINTENANCE_RE }).click();

  await expect.element(page.getByText("Minute")).toBeVisible();
  await expect.element(page.getByText("“At 03:00, every day”")).toBeVisible();
  await expect.element(page.getByText("Sun 5 Jul, 03:00")).toBeVisible();
  await expect(page.getByTestId("screenshot-frame")).toMatchScreenshot(
    "data-explorer-other-database-objects-pg-cron"
  );
});
