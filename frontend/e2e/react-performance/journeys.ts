import { create, equals, fromJsonString, toJson } from "@bufbuild/protobuf";
import { expect, type Page, type Response } from "playwright/test";
import {
  buildInstanceMetricsInput,
  buildPreviousInstanceMetricsInput,
} from "../../src/lib/metrics";
import { QueryMetricsRequestSchema } from "../../src/protogen/querylane/console/v1alpha1/metrics_pb";
import {
  ExecuteQueryResponseSchema,
  SQLService,
} from "../../src/protogen/querylane/console/v1alpha1/sql_pb";
import {
  ADMIN_SHELL_FIXTURE,
  CONSOLE_FIXED_NOW,
} from "../../src/test/fixtures/console-resource-fixtures";
import { workbenchQueryResponses } from "../../src/test/fixtures/sql-workbench-fixtures";
import { mockDataExplorerApp } from "../tests/data-explorer-fixtures";
import { mockOverviewSupportData, mockRpc } from "../tests/helpers";
import {
  DATABASE_URL,
  INSTANCE_URL,
  mockConsoleResources,
} from "../visual/console-resource-fixtures";
import { connectStreamBody } from "../visual/serve-service";
import { settleMetricResponses } from "./settle-metric-response";

const ORDERS_BUTTON = /^orders 4 KB$/u;
const ORDERS_HEADING = /public\.orders/u;
const ORDERS_URL = /category=tables.*name=orders/u;
const RUN_BUTTON = /^Run/u;
const CONNECTIONS_TAB = /^Connections/u;
const EXPLORER = "/instances/production/databases/appdb/explorer?schema=public";
const WORKBENCH = `${DATABASE_URL}/workbench`;
const MEASURED_RANGE_HOURS = 6;

interface ReactProfileJourney {
  act: (page: Page) => Promise<void>;
  id: string;
  prepare: (page: Page) => Promise<void>;
  setup: (page: Page) => Promise<void>;
}

async function prepareExplorer(page: Page) {
  await page.goto(EXPLORER);
  await expect(
    page.getByRole("heading", { name: "public", exact: true })
  ).toBeVisible();
}
async function prepareWorkbench(page: Page) {
  await page.goto(WORKBENCH);
  await expect(page.getByRole("textbox", { name: "SQL editor" })).toBeVisible();
}
function metricsWindowResponse(
  input:
    | ReturnType<typeof buildInstanceMetricsInput>
    | ReturnType<typeof buildPreviousInstanceMetricsInput>
) {
  const expected = create(QueryMetricsRequestSchema, input);
  return (response: Response) => {
    if (
      !(response.url().includes("MetricsService/QueryMetrics") && response.ok())
    ) {
      return false;
    }
    const payload = response.request().postData();
    if (payload === null) {
      throw new Error("Metrics request has no payload");
    }
    return equals(
      QueryMetricsRequestSchema,
      fromJsonString(QueryMetricsRequestSchema, payload),
      expected
    );
  };
}
async function prepareMetrics(page: Page) {
  await page.goto(INSTANCE_URL);
  await expect(
    page.getByRole("button", { name: "1h", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("img", { name: "74 of 100 connections in use" })
  ).toBeVisible();
  await page.getByRole("tab", { name: CONNECTIONS_TAB }).click();
  await expect(
    page.getByRole("img", { name: "Metric time series", exact: true })
  ).toBeVisible();
  await expect(page.getByText("previous", { exact: true })).toBeVisible();
}

const REACT_PROFILE_JOURNEYS: ReactProfileJourney[] = [
  {
    id: "explorer-selection-filter:v1",
    async setup(page) {
      await mockOverviewSupportData(page);
      await mockDataExplorerApp(page);
    },
    prepare: prepareExplorer,
    async act(page) {
      await page.getByPlaceholder("Filter…").fill("ord");
      await page.getByRole("button", { name: ORDERS_BUTTON }).click();
      await expect(
        page.getByRole("heading", { name: ORDERS_HEADING })
      ).toBeVisible();
      await expect(page.getByText("ada@example.com")).toBeVisible();
      await expect(page).toHaveURL(ORDERS_URL);
    },
  },
  {
    id: "sql-result-interaction:v1",
    async setup(page) {
      await mockConsoleResources(page, ADMIN_SHELL_FIXTURE);
      await mockRpc(page, "SQLService/ValidateQuery", {});
      await page.route(
        `**/${SQLService.typeName}/${SQLService.method.executeQuery.name}`,
        (route) =>
          route.fulfill({
            body: connectStreamBody(
              workbenchQueryResponses().map((message) =>
                toJson(ExecuteQueryResponseSchema, message)
              )
            ),
            contentType: "application/connect+json",
          })
      );
    },
    prepare: prepareWorkbench,
    async act(page) {
      await page
        .getByRole("textbox", { name: "SQL editor" })
        .fill("SELECT ref, carrier, eta FROM shipping.shipments;");
      await page.getByRole("button", { name: RUN_BUTTON }).click();
      const result = page.getByRole("gridcell", {
        name: "ML-2026-048292",
        exact: true,
      });
      await expect(result).toBeVisible();
      await result.click();
      await expect(result).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(result).not.toBeFocused();
    },
  },
  {
    id: "metrics-range-change:v1",
    async setup(page) {
      await mockConsoleResources(page, {
        ...ADMIN_SHELL_FIXTURE,
        metrics: true,
      });
    },
    prepare: prepareMetrics,
    async act(page) {
      const range = page.getByRole("button", { name: "6h", exact: true });
      const response = page.waitForResponse(
        metricsWindowResponse(
          buildInstanceMetricsInput(
            "instances/production",
            CONSOLE_FIXED_NOW.getTime(),
            MEASURED_RANGE_HOURS
          )
        )
      );
      const previousResponse = page.waitForResponse(
        metricsWindowResponse(
          buildPreviousInstanceMetricsInput(
            "instances/production",
            CONSOLE_FIXED_NOW.getTime(),
            MEASURED_RANGE_HOURS
          )
        )
      );
      await range.click();
      await settleMetricResponses(
        await Promise.all([response, previousResponse]),
        async () => {
          await expect(range).toHaveAttribute("aria-pressed", "true");
          const chart = page.getByRole("img", {
            name: "Metric time series",
            exact: true,
          });
          await expect(
            page.locator('[data-slot="chart"]').filter({ has: chart })
          ).toHaveAttribute("aria-busy", "false");
          await expect(chart).toBeVisible();
          await expect(
            page.getByText("previous", { exact: true })
          ).toBeVisible();
          await expect(page.getByRole("alert")).toHaveCount(0);
        }
      );
    },
  },
];

export type { ReactProfileJourney };
export { REACT_PROFILE_JOURNEYS };
