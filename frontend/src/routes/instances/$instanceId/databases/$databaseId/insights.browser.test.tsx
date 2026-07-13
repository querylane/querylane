import { create as createProto } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { BackendDatabaseQueryInsightsPage } from "@/components/console-pages/database-query-insights-page";
import {
  DatabaseQueryInsightsSchema,
  DatabaseSchema,
  type GetDatabaseQueryInsightsResponse,
  GetDatabaseQueryInsightsResponseSchema,
  type GetDatabaseResponse,
  GetDatabaseResponseSchema,
  QueryRuntimeInsightSchema,
  SequentialScanHotspotSchema,
  TableCacheHitInsightSchema,
} from "@/protogen/querylane/console/v1alpha1/database_pb";

interface QueryState<T> {
  data?: T;
  error?: unknown;
  isFetching?: boolean;
  isPending?: boolean;
  refetch?: () => Promise<unknown>;
}

const state = vi.hoisted(() => ({
  databaseQuery: {} as QueryState<GetDatabaseResponse>,
  queryInsightsQuery: {} as QueryState<GetDatabaseQueryInsightsResponse>,
}));
const UPDATE_SHIPMENTS_QUERY_RE = /UPDATE shipping.shipments/i;

vi.mock("@/hooks/api/database", () => ({
  useGetDatabaseQuery: () => ({
    data: state.databaseQuery.data,
    error: state.databaseQuery.error ?? null,
    isFetching: state.databaseQuery.isFetching ?? false,
    isPending: state.databaseQuery.isPending ?? false,
    refetch: state.databaseQuery.refetch ?? vi.fn(async () => undefined),
  }),
  useGetDatabaseQueryInsightsQuery: () => ({
    data: state.queryInsightsQuery.data,
    error: state.queryInsightsQuery.error ?? null,
    isFetching: state.queryInsightsQuery.isFetching ?? false,
    isPending: state.queryInsightsQuery.isPending ?? false,
    refetch: state.queryInsightsQuery.refetch ?? vi.fn(async () => undefined),
  }),
}));

function databaseResponse() {
  return createProto(GetDatabaseResponseSchema, {
    database: createProto(DatabaseSchema, {
      characterSet: "UTF8",
      collation: "en_US.UTF-8",
      displayName: "logistics",
      isSystemDatabase: false,
      name: "instances/prod-core-eu/databases/logistics",
      owner: "ops",
    }),
  });
}

function queryInsightsResponse() {
  return createProto(GetDatabaseQueryInsightsResponseSchema, {
    queryInsights: createProto(DatabaseQueryInsightsSchema, {
      observedAt: timestampFromDate(new Date("2026-07-05T21:43:00Z")),
      queryStatsAvailable: true,
      sequentialScanHotspots: [
        createProto(SequentialScanHotspotSchema, {
          indexScans: 64n,
          schemaName: "shipping",
          sequentialScanRatio: 0.93,
          sequentialScans: 840n,
          tableName: "shipment_event",
          totalSizeBytes: 21_400_000_000n,
        }),
        createProto(SequentialScanHotspotSchema, {
          indexScans: 32n,
          schemaName: "logistics",
          sequentialScanRatio: 0.72,
          sequentialScans: 180n,
          tableName: "customs_doc",
          totalSizeBytes: 1_800_000_000n,
        }),
        createProto(SequentialScanHotspotSchema, {
          indexScans: 420n,
          schemaName: "audit",
          sequentialScanRatio: 0.46,
          sequentialScans: 96n,
          tableName: "change_log",
          totalSizeBytes: 3_900_000_000n,
        }),
      ],
      tableCacheHits: [
        createProto(TableCacheHitInsightSchema, {
          heapBlocksHit: 498_500n,
          heapBlocksRead: 1_000n,
          hitRatio: 0.998,
          schemaName: "shipping",
          tableName: "shipments",
          totalSizeBytes: 8_300_000_000n,
        }),
        createProto(TableCacheHitInsightSchema, {
          heapBlocksHit: 19_200n,
          heapBlocksRead: 0n,
          hitRatio: 1,
          schemaName: "shipping",
          tableName: "carriers",
          totalSizeBytes: 42_000_000n,
        }),
        createProto(TableCacheHitInsightSchema, {
          heapBlocksHit: 971_900n,
          heapBlocksRead: 28_100n,
          hitRatio: 0.972,
          schemaName: "shipping",
          tableName: "shipment_event",
          totalSizeBytes: 21_400_000_000n,
        }),
        createProto(TableCacheHitInsightSchema, {
          heapBlocksHit: 914_000n,
          heapBlocksRead: 86_000n,
          hitRatio: 0.914,
          schemaName: "audit",
          tableName: "change_log",
          totalSizeBytes: 3_900_000_000n,
        }),
        createProto(TableCacheHitInsightSchema, {
          heapBlocksHit: 220_000n,
          heapBlocksRead: 220n,
          hitRatio: 0.999,
          schemaName: "billing",
          tableName: "invoices",
          totalSizeBytes: 1_100_000_000n,
        }),
      ],
      tableStatsAvailable: true,
      topQueries: [
        createProto(QueryRuntimeInsightSchema, {
          calls: 412_000n,
          meanTimeMs: 8.4,
          query:
            "SELECT * FROM shipping.shipment_event WHERE shipment_id = $1 ORDER BY recorded_at DESC",
          queryId: 48_120_137n,
          totalTimeMs: 3_462_000,
          totalTimeRatio: 1,
        }),
        createProto(QueryRuntimeInsightSchema, {
          calls: 188_000n,
          meanTimeMs: 11.2,
          query:
            "UPDATE shipping.shipments SET status = $1, updated_at = now() WHERE id = $2",
          queryId: 48_120_274n,
          totalTimeMs: 2_106_000,
          totalTimeRatio: 0.61,
        }),
        createProto(QueryRuntimeInsightSchema, {
          calls: 96_000n,
          meanTimeMs: 13.8,
          query:
            "SELECT s.*, c.name FROM shipping.shipments s JOIN shipping.carriers c ON c.id = s.carrier_id WHERE s.status = ANY($1)",
          queryId: 48_120_411n,
          totalTimeMs: 1_326_000,
          totalTimeRatio: 0.38,
        }),
        createProto(QueryRuntimeInsightSchema, {
          calls: 540_000n,
          meanTimeMs: 1.3,
          query:
            "INSERT INTO audit.change_log (table_name, op, actor, diff) VALUES ($1, $2, $3, $4)",
          queryId: 48_120_548n,
          totalTimeMs: 702_000,
          totalTimeRatio: 0.2,
        }),
        createProto(QueryRuntimeInsightSchema, {
          calls: 8600n,
          meanTimeMs: 38,
          query:
            "SELECT count(*) FROM shipping.shipments WHERE eta < now() AND status <> 'delivered'",
          queryId: 48_120_685n,
          totalTimeMs: 324_000,
          totalTimeRatio: 0.09,
        }),
      ],
    }),
  });
}

beforeEach(() => {
  state.databaseQuery = { data: databaseResponse() };
  state.queryInsightsQuery = { data: queryInsightsResponse() };
});

test("query insights route matches the redesign visual slice", async () => {
  render(
    <ScreenshotFrame>
      <div
        className="w-[1280px] rounded-2xl border border-border bg-background p-6 text-foreground"
        data-testid="query-insights-route-visual-surface"
      >
        <BackendDatabaseQueryInsightsPage
          databaseId="logistics"
          instanceId="prod-core-eu"
        />
      </div>
    </ScreenshotFrame>
  );

  await expect
    .element(page.getByRole("heading", { name: "Query insights" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("region", { name: "Query detail" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Type" }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Mean" }))
    .toBeVisible();
  const surface = page
    .getByTestId("query-insights-route-visual-surface")
    .element();
  const detail = page.getByRole("region", { name: "Query detail" }).element();
  expect(detail.scrollWidth).toBeLessThanOrEqual(detail.clientWidth);
  expect(detail.getBoundingClientRect().right).toBeLessThanOrEqual(
    surface.getBoundingClientRect().right
  );
  for (const label of ["Calls", "Mean", "Total", "Relative to top"]) {
    const metricLabel = Array.from(detail.querySelectorAll("div")).find(
      (element) =>
        element.children.length === 0 && element.textContent === label
    );
    expect(metricLabel).toBeTruthy();
    expect(metricLabel?.getBoundingClientRect().right).toBeLessThanOrEqual(
      detail.getBoundingClientRect().right
    );
  }
  await expect
    .element(page.getByRole("button", { name: UPDATE_SHIPMENTS_QUERY_RE }))
    .toBeVisible();
  await expect
    .element(page.getByText("shipping.shipment_event").first())
    .toBeVisible();

  await expect(
    page.getByTestId("query-insights-route-visual-surface")
  ).toMatchScreenshot("query-insights-route-redesign");
});

test("query detail follows the query table on narrow viewports", async () => {
  await page.viewport(390, 600);
  render(
    <ScreenshotFrame>
      <div className="w-full bg-background p-4 text-foreground">
        <BackendDatabaseQueryInsightsPage
          databaseId="logistics"
          instanceId="prod-core-eu"
        />
      </div>
    </ScreenshotFrame>
  );

  const initialScrollY = window.scrollY;
  await page.getByRole("button", { name: UPDATE_SHIPMENTS_QUERY_RE }).click();

  const topQueriesCard = page
    .getByText("Top queries by total time")
    .element()
    .closest('[data-slot="card"]');
  const detail = page.getByRole("region", { name: "Query detail" }).element();
  const tableStatsCard = page
    .getByText("Sequential scan hotspots")
    .element()
    .closest('[data-slot="card"]');
  if (!(topQueriesCard && tableStatsCard)) {
    throw new Error("Expected query insight cards");
  }

  expect(document.activeElement).toBe(detail);
  expect(window.scrollY).toBeGreaterThan(initialScrollY);
  expect(detail.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  expect(detail.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    window.innerHeight
  );
  expect(detail.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    topQueriesCard.getBoundingClientRect().bottom
  );
  expect(detail.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    tableStatsCard.getBoundingClientRect().top
  );
});
