import { toJson } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  ExecuteQueryResponseSchema,
  SQLService,
} from "../../src/protogen/querylane/console/v1alpha1/sql_pb";
import { EXPLAIN_ANALYZE_FIXTURE } from "../../src/test/fixtures/explain-plan-fixture";
import { workbenchQueryResponses } from "../../src/test/fixtures/sql-workbench-fixtures";
import {
  DATABASE_URL,
  mockConsoleResources,
} from "../visual/console-resource-fixtures";
import { connectStreamBody } from "../visual/serve-service";
import { expect, softScreenshot, test } from "./base";
import { mockRpc } from "./helpers";

const RUN_BUTTON_NAME_RE = /^Run/u;

test("storage quota keeps rejected SQL work intact and warns that new drafts are in memory", async ({
  page,
}) => {
  const raw = JSON.stringify({ version: 0, state: { workspaces: "broken" } });
  await mockConsoleResources(page);
  await page.addInitScript((value) => {
    const writers = new Map<Storage, Storage["setItem"]>([
      [localStorage, localStorage.setItem.bind(localStorage)],
      [sessionStorage, sessionStorage.setItem.bind(sessionStorage)],
    ]);
    function writeWithRecoveryQuota(this: Storage, name: string, text: string) {
      if (name.endsWith(".recovery")) {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      const write = writers.get(this);
      if (!write) {
        throw new Error("Unexpected storage instance");
      }
      write(name, text);
    }
    Storage.prototype.setItem = writeWithRecoveryQuota;
    localStorage.setItem("querylane.sql-workbench.v1", value);
  }, raw);
  await page.goto(`${DATABASE_URL}/workbench`);
  await expect(
    page.getByText("SQL changes are only stored in memory", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "SQL editor" })
    .fill("SELECT 'keep this draft';");
  const stored = await page.evaluate(() => {
    globalThis.dispatchEvent(new Event("pagehide"));
    return localStorage.getItem("querylane.sql-workbench.v1");
  });
  expect(stored).toBe(raw);
  await softScreenshot(page, "sql-workbench-storage-quota");
});

test("invalid saved SQL work stays recoverable after creating a new draft", async ({
  page,
}) => {
  const raw = JSON.stringify({
    version: 0,
    state: { workspaces: "broken", history: {}, savedQueries: {} },
  });
  await mockConsoleResources(page);
  await page.addInitScript((value) => {
    localStorage.setItem("querylane.sql-workbench.v1", value);
  }, raw);
  await page.goto(`${DATABASE_URL}/workbench`);
  await expect(
    page.getByText("Saved SQL work could not be loaded", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "SQL editor" })
    .fill("SELECT 'new draft';");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("querylane.sql-workbench.v1.recovery")
      )
    )
    .toBe(raw);
});

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

test("workbench recovers from an error and inspects the live execution plan", async ({
  page,
  makeAxeBuilder,
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
    plan: EXPLAIN_ANALYZE_FIXTURE,
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
    page.getByRole("tab", { name: "Map", exact: true })
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Inspect Seq Scan on shipments", exact: true })
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Plan node details",
  });
  await expect(
    inspector.getByText("100× more rows", { exact: true })
  ).toBeVisible();
  await expect(
    inspector.getByText("(status = 'customs_hold'::text)", { exact: true })
  ).toBeVisible();
  await page.getByRole("tab", { name: "Operators", exact: true }).click();
  await page.getByRole("button", { name: "Collapse Hash Join branch" }).click();
  await expect(
    page.getByRole("button", {
      name: "Inspect Seq Scan on shipments",
      exact: true,
    })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Find hotspot" }).click();
  await expect(
    page.getByRole("button", {
      name: "Inspect Seq Scan on shipments",
      exact: true,
    })
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name: "Plan metric" }).click();
  await page
    .getByRole("option", { name: "Shared buffers", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "Shared blocks" })
  ).toBeVisible();
  const awaitedResult1 = await makeAxeBuilder()
    .include('[aria-label="Query plan"]')
    .analyze();
  expect(awaitedResult1.violations).toEqual([]);
  await expect(page).toHaveURL(url);
  await softScreenshot(page, "workbench-plan-inspector");
});

test("phone navigation dismisses the sidebar and plan focus restores keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockConsoleResources(page);
  await mockRpc(page, "SQLService/ValidateQuery", {});
  await mockRpc(page, "SQLService/ExplainQuery", {
    plan: EXPLAIN_ANALYZE_FIXTURE,
  });
  await page.goto(DATABASE_URL);
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  await page
    .getByRole("link", { name: "SQL workbench", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(`${DATABASE_URL}/workbench`);
  await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeHidden();
  await page
    .getByRole("textbox", { name: "SQL editor" })
    .fill("SELECT * FROM shipping.shipments;");
  await page.getByRole("button", { name: "More ways to run" }).click();
  await page.getByRole("menuitem", { name: "Explain analyze" }).click();
  await page.getByRole("button", { name: "Focus plan" }).click();
  const map = page.getByRole("region", { name: "Plan map" });
  const operation = page.getByRole("button", {
    name: "Inspect Seq Scan on shipments",
    exact: true,
  });
  await expect
    .poll(async () => {
      const bounds = await map.boundingBox();
      const node = await operation.boundingBox();
      return (
        bounds &&
        node &&
        node.x >= bounds.x &&
        node.x + node.width <= bounds.x + bounds.width
      );
    })
    .toBe(true);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expect
    .poll(async () => {
      const bounds = await map.boundingBox();
      return await map.getByRole("button").evaluateAll(
        (elements, viewport) =>
          elements.every((element) => {
            const rect = element.getBoundingClientRect();
            return (
              viewport !== null &&
              rect.left >= viewport.x &&
              rect.right <= viewport.x + viewport.width &&
              rect.top >= viewport.y &&
              rect.bottom <= viewport.y + viewport.height
            );
          }),
        bounds
      );
    })
    .toBe(true);
  await operation.click();
  await expect(
    page
      .getByRole("complementary", { name: "Plan node details" })
      .getByRole("heading", { name: "Seq Scan" })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Focus plan" })).toBeFocused();
});
