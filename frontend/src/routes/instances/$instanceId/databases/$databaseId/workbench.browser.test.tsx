import { create } from "@bufbuild/protobuf";
import { durationFromMs } from "@bufbuild/protobuf/wkt";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ScreenshotFrame } from "@/__tests__/browser-test-utils";
import { SqlWorkbenchPage } from "@/features/sql-workbench/sql-workbench-page";
import {
  type ExecuteQueryResponse,
  ExecuteQueryResponseSchema,
  ExplainQueryResponseSchema,
} from "@/protogen/querylane/console/v1alpha1/sql_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const READ_ONLY_GUARD_NAME_RE = /read-only guard/i;
const RUN_BUTTON_NAME_RE = /^Run/;
const SERVER_SIDE_VALIDATOR_RE = /server-side validator/i;
const PLAN_INSIGHTS_RE = /Plan insights/;
const SLOWEST_NODE_INSIGHT_RE = /Slowest node: Index Scan/;
const EXPLAIN_PLAN = `Limit  (cost=112.41..112.53 rows=50 width=64) (actual time=27.78..27.80 rows=50 loops=1)
  Buffers: shared hit=1852 read=126
  ->  Sort  (cost=112.41..115.36 rows=1180 width=64) (actual time=27.77..27.78 rows=50 loops=1)
        Sort Key: s.eta
        ->  Hash Join  (cost=13.02..104.90 rows=1180 width=64) (actual time=0.93..27.43 rows=1204 loops=1)
              ->  Index Scan using shipments_status_idx on shipping.shipments s  (cost=0.43..88.20 rows=1180 width=52) (actual time=0.71..25.51 rows=1204 loops=1)
              ->  Hash  (cost=9.80..9.80 rows=312 width=20) (actual time=0.69..0.69 rows=312 loops=1)
                    ->  Seq Scan on shipping.carriers c  (cost=0.00..9.80 rows=312 width=20) (actual time=0.02..0.28 rows=312 loops=1)
Planning Time: 0.42 ms
Execution Time: 27.80 ms`;
const VISUAL_TEST_TIMEOUT_MS = 60_000;

const apiMocks = vi.hoisted(() => ({
  executeWorkbenchQuery: vi.fn(),
  explainWorkbenchQuery: vi.fn(),
}));

vi.mock("@/hooks/api/sql", () => apiMocks);

function streamResponses(
  responses: ExecuteQueryResponse[]
): AsyncIterable<ExecuteQueryResponse> {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve();
      for (const response of responses) {
        yield response;
      }
    },
  };
}

function queryResponseStream() {
  return streamResponses([
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "columnMetadata",
        value: {
          columns: [
            {
              columnName: "ref",
              dataType: DataType.STRING,
              isNullable: false,
              mayTruncate: false,
              rawType: "TEXT",
            },
            {
              columnName: "carrier",
              dataType: DataType.STRING,
              isNullable: false,
              mayTruncate: false,
              rawType: "TEXT",
            },
            {
              columnName: "eta",
              dataType: DataType.DATE,
              isNullable: false,
              mayTruncate: false,
              rawType: "DATE",
            },
          ],
        },
      },
    }),
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "rowBatch",
        value: {
          rows: [
            {
              rowKey: "row-1",
              values: [
                {
                  fullSizeBytes: 0n,
                  fullValueToken: "",
                  truncated: false,
                  value: {
                    kind: { case: "stringValue", value: "ML-2026-048292" },
                  },
                },
                {
                  fullSizeBytes: 0n,
                  fullValueToken: "",
                  truncated: false,
                  value: {
                    kind: {
                      case: "stringValue",
                      value: "Pacific Crest Shipping",
                    },
                  },
                },
                {
                  fullSizeBytes: 0n,
                  fullValueToken: "",
                  truncated: false,
                  value: { kind: { case: "stringValue", value: "2026-07-06" } },
                },
              ],
            },
            {
              rowKey: "row-2",
              values: [
                {
                  fullSizeBytes: 0n,
                  fullValueToken: "",
                  truncated: false,
                  value: {
                    kind: { case: "stringValue", value: "ML-2026-048296" },
                  },
                },
                {
                  fullSizeBytes: 0n,
                  fullValueToken: "",
                  truncated: false,
                  value: {
                    kind: {
                      case: "stringValue",
                      value: "Pacific Crest Shipping",
                    },
                  },
                },
                {
                  fullSizeBytes: 0n,
                  fullValueToken: "",
                  truncated: false,
                  value: { kind: { case: "stringValue", value: "2026-07-08" } },
                },
              ],
            },
          ],
        },
      },
    }),
    create(ExecuteQueryResponseSchema, {
      result: {
        case: "stats",
        value: {
          latency: durationFromMs(27.8),
          notices: ["using index shipments_status_idx"],
          rowCount: 2n,
          truncated: false,
        },
      },
    }),
  ]);
}

function getWorkbenchContentRegion() {
  const scrollRegion = page
    .getByRole("region", { name: "SQL workbench content" })
    .element();
  if (!(scrollRegion instanceof HTMLElement)) {
    throw new TypeError("SQL workbench content region was not rendered.");
  }

  return scrollRegion;
}

function renderWorkbench() {
  render(
    <ScreenshotFrame>
      <div
        className="h-[900px] w-[1232px] overflow-hidden rounded-2xl border border-border bg-background text-foreground"
        data-testid="sql-workbench-visual-surface"
      >
        <SqlWorkbenchPage databaseId="logistics" instanceId="prod-core-eu" />
      </div>
    </ScreenshotFrame>
  );
}

beforeEach(() => {
  apiMocks.executeWorkbenchQuery.mockReset();
  apiMocks.executeWorkbenchQuery.mockReturnValue(queryResponseStream());
  apiMocks.explainWorkbenchQuery.mockReset();
  apiMocks.explainWorkbenchQuery.mockResolvedValue(
    create(ExplainQueryResponseSchema, {
      latency: durationFromMs(27.8),
      notices: [],
      plan: EXPLAIN_PLAN,
    })
  );
});

test(
  "SQL workbench route keeps the editor and results layout visually stable",
  async () => {
    renderWorkbench();

    await expect
      .element(page.getByRole("heading", { name: "SQL workbench" }))
      .toBeVisible();
    await expect.element(page.getByText("customs-holds.sql")).toBeVisible();
    await page.getByRole("button", { name: RUN_BUTTON_NAME_RE }).click();
    await expect
      .element(page.getByText("Pacific Crest Shipping").first())
      .toBeVisible();
    await expect(
      page.getByTestId("sql-workbench-visual-surface")
    ).toMatchScreenshot("sql-workbench-editor-results");
  },
  VISUAL_TEST_TIMEOUT_MS
);

test("SQL workbench read-only guard explains backend enforcement", async () => {
  renderWorkbench();

  await page.getByRole("button", { name: READ_ONLY_GUARD_NAME_RE }).click();

  await expect.element(page.getByText("How the guard works")).toBeVisible();
  await expect.element(page.getByText(SERVER_SIDE_VALIDATOR_RE)).toBeVisible();
  await expect.element(page.getByText("SELECT INTO")).toBeVisible();
});

test(
  "SQL workbench route keeps explain graph and insights visually stable",
  async () => {
    renderWorkbench();

    await page.getByRole("button", { name: "Explain" }).click();

    await expect.element(page.getByText(PLAN_INSIGHTS_RE)).toBeVisible();
    await expect.element(page.getByText(SLOWEST_NODE_INSIGHT_RE)).toBeVisible();
    const scrollRegion = getWorkbenchContentRegion();
    scrollRegion.scrollTop = 860;
    await expect.poll(() => scrollRegion.scrollTop).toBeGreaterThan(0);
    await expect(
      page.getByTestId("sql-workbench-visual-surface")
    ).toMatchScreenshot("sql-workbench-explain-graph");
  },
  VISUAL_TEST_TIMEOUT_MS
);

test(
  "SQL workbench route keeps the visual builder visually stable",
  async () => {
    renderWorkbench();

    await page.getByRole("button", { name: RUN_BUTTON_NAME_RE }).click();
    await page.getByRole("button", { name: "Visual builder" }).click();

    await expect.element(page.getByText("Query pipeline")).toBeVisible();
    await expect
      .element(page.getByText("logistics.shipping.shipments"))
      .toBeVisible();
    await expect(
      page.getByTestId("sql-workbench-visual-surface")
    ).toMatchScreenshot("sql-workbench-visual-builder");
  },
  VISUAL_TEST_TIMEOUT_MS
);
