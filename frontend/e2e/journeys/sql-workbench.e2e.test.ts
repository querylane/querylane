import { Code, ConnectError } from "@connectrpc/connect";
import { EXPLAIN_ANALYZE_FIXTURE } from "../fixtures/explain-plan.fixture";
import { workbenchQueryMessages } from "../fixtures/sql-workbench.fixture";
import { connectStreamResponse } from "../visual/connect-rpc.test-utils";
import {
  DATABASE_URL,
  mockConsoleResources,
} from "../visual/console-resource.fixture";
import { expect, test } from "./browser.test-utils";
import { mockRpc, mockRpcStream } from "./msw-network.test-utils";

const SHIPMENTS_NODE_NAME = /^(?:Inspect )?Seq Scan\b.*\bshipments\b/u;

const RUN_BUTTON_NAME_RE = /^Run/u;

test("invalid saved SQL work stays recoverable after creating a new draft", async ({
  page,
}) => {
  const raw = JSON.stringify({
    version: 0,
    state: { workspaces: "broken", history: {}, savedQueries: {} },
  });
  await mockConsoleResources(page);
  await page.addInitScript((value) => {
    if (localStorage.getItem("querylane.sql-workbench.v1") === null) {
      localStorage.setItem("querylane.sql-workbench.v1", value);
    }
  }, raw);
  await page.goto(`${DATABASE_URL}/workbench`);
  await expect(
    page.getByText("Saved SQL work could not be loaded", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "SQL editor" })
    .fill("SELECT 'new draft';");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "SQL editor" })).toContainText(
    "SELECT 'new draft';"
  );
  const recovered = await page.evaluate(() =>
    localStorage.getItem("querylane.sql-workbench.v1.recovery")
  );
  expect(recovered).toBe(raw);
});

test("workbench recovers from an error and inspects the live execution plan", async ({
  page,
  checkAccessibility,
}) => {
  await mockConsoleResources(page);
  await mockRpc(page, "SQLService/ValidateQuery", {});
  const executeMethod = "SQLService/ExecuteQuery";
  await mockRpcStream(page, executeMethod, {
    respond: () =>
      connectStreamResponse(workbenchQueryMessages({ truncated: true })),
  });
  await mockRpcStream(page, executeMethod, {
    once: true,
    respond: () =>
      connectStreamResponse(
        [],
        new ConnectError("query connection interrupted", Code.Aborted)
      ),
  });
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
    .getByRole("button", { name: SHIPMENTS_NODE_NAME, exact: true })
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
      name: SHIPMENTS_NODE_NAME,
      exact: true,
    })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Find hotspot" }).click();
  await expect(
    page.getByRole("button", {
      name: SHIPMENTS_NODE_NAME,
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
  await checkAccessibility();
  await expect(page).toHaveURL(url);
});
