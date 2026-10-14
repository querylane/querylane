import { toJson } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  ExecuteQueryResponseSchema,
  SQLService,
} from "../../src/protogen/querylane/console/v1alpha1/sql_pb";
import { workbenchQueryResponses } from "../../src/test/fixtures/sql-workbench-fixtures";
import {
  DATABASE_URL,
  mockConsoleResources,
} from "../visual/console-resource-fixtures";
import { connectStreamBody } from "../visual/serve-service";
import { expect, softScreenshot, test } from "./base";
import { mockRpc } from "./helpers";

const RUN_BUTTON_NAME_RE = /^Run/;

for (const routeName of ["workbench", "sql"]) {
  test(`${routeName} keeps its URL and runs queries in the current workbench`, async ({
    page,
  }) => {
    await mockConsoleResources(page);
    await mockRpc(page, "SQLService/ValidateQuery", {});
    await page.route(
      `**/${SQLService.typeName}/${SQLService.method.executeQuery.name}`,
      async (route) => {
        await route.fulfill({
          body: connectStreamBody(
            workbenchQueryResponses().map((message) =>
              toJson(ExecuteQueryResponseSchema, message)
            )
          ),
          contentType: "application/connect+json",
        });
      }
    );
    const url = `${DATABASE_URL}/${routeName}`;
    await page.goto(url);
    const editor = page.getByRole("textbox", { name: "SQL editor" });
    await editor.fill("SELECT ref, carrier, eta FROM shipping.shipments;");
    // Unlike the retired editor, the shipped workbench exposes its working
    // formatter and execution menu. The catalog also lives in the shell rail.
    await expect(
      page.getByRole("button", { name: "Format", exact: true })
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "More ways to run" })
    ).toBeEnabled();
    await expect(
      page.getByRole("complementary", { name: "Database objects" })
    ).toBeVisible();
    await page.getByRole("button", { name: RUN_BUTTON_NAME_RE }).click();
    await expect(
      page.getByText("ML-2026-048292", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("2 rows", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(url);
    await softScreenshot(page, `${routeName}-current-workbench`);
  });
}

test("workbench recovers from a server error and renders the live explain tree", async ({
  page,
}) => {
  await mockConsoleResources(page);
  await mockRpc(page, "SQLService/ValidateQuery", {});
  let requests = 0;
  await page.route(
    `**/${SQLService.typeName}/${SQLService.method.executeQuery.name}`,
    async (route) => {
      requests += 1;
      await route.fulfill({
        body:
          requests === 1
            ? connectStreamBody(
                [],
                new ConnectError("query connection interrupted", Code.Aborted)
              )
            : connectStreamBody(
                workbenchQueryResponses({ truncated: true }).map((message) =>
                  toJson(ExecuteQueryResponseSchema, message)
                )
              ),
        contentType: "application/connect+json",
      });
    }
  );
  await mockRpc(page, "SQLService/ExplainQuery", {
    plan: JSON.stringify([
      {
        Plan: {
          "Node Type": "Seq Scan",
          "Relation Name": "shipments",
          "Plan Rows": 2,
          "Actual Rows": 2,
          "Actual Loops": 1,
          "Actual Total Time": 4,
          "Total Cost": 10,
        },
        "Execution Time": 4,
      },
    ]),
  });
  const url = `${DATABASE_URL}/workbench`;
  await page.goto(url);
  await page
    .getByRole("textbox", { name: "SQL editor" })
    .fill("SELECT * FROM shipping.shipments;");
  await page.getByRole("button", { name: RUN_BUTTON_NAME_RE }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("ML-2026-048292", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Stopped at the 1,000 row limit", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "More ways to run" }).click();
  await page.getByRole("menuitem", { name: "Explain analyze" }).click();
  await expect(
    page.getByRole("tab", { name: "Tree", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", {
      name: "Show details for Seq Scan on shipments",
      exact: true,
    })
  ).toBeVisible();
  await expect(page).toHaveURL(url);
  await softScreenshot(page, "workbench-explain-tree");
});
