import { HttpResponse } from "msw";
import type { Page } from "playwright/test";
import { expect, test } from "./browser.test-utils";
import {
  mockRpc,
  mockRpcResponse,
  mockRpcWith,
  waitForRpc,
} from "./msw-network.test-utils";
import {
  mockDatabaseDetails,
  mockDatabases,
  mockInstanceDetails,
  mockOverviewSupportData,
  mockReadyEmptyApp,
  sampleDatabase,
  sampleInstance,
} from "./querylane-rpc.fixture";

const DATABASE_EXPLORER =
  /\/instances\/production\/databases\/appdb\/explorer\/?(?:\?|$)/u;
const CREATE = "InstanceService/CreateInstance";
const STANDALONE_CONNECTION_TEST = "InstanceService/TestInstanceConnection";

async function testConnection(page: Page) {
  const request = waitForRpc(page, STANDALONE_CONNECTION_TEST);
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Connection successful.")).toBeVisible();
  return await request;
}

test("creates an SSL-configured instance only after retesting edited credentials", {
  tag: ["@smoke", "@feat:instances", "@flow:create"],
}, async ({ page }) => {
  let created = false;
  await mockOverviewSupportData(page);
  await mockReadyEmptyApp(page);
  await mockRpcWith(page, "InstanceService/ListInstances", () => ({
    instances: created ? [sampleInstance] : [],
    nextPageToken: "",
  }));
  await mockInstanceDetails(page);
  await mockDatabases(page, [sampleDatabase]);
  await mockDatabaseDetails(page);
  await mockRpc(page, STANDALONE_CONNECTION_TEST, {});
  await mockRpc(page, "SchemaService/ListSchemas", {
    schemas: [
      {
        displayName: "public",
        name: "instances/production/databases/appdb/schemas/public",
        owner: "app_owner",
      },
    ],
  });
  await mockRpc(page, "TableService/ListTables", { tables: [] });
  await mockRpc(page, "ViewService/ListViews", { views: [] });
  await mockRpcResponse(page, CREATE, () => {
    created = true;
    return HttpResponse.json({ instance: sampleInstance });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
  const create = page.getByRole("button", { name: "Create instance" });
  await test.step("apply the DSN and invalidate the first connection test with a host edit", async () => {
    await page.getByLabel("Display name").fill("Production Postgres");
    await page
      .getByLabel("Connection string")
      .fill(
        "postgres://alice:testing-only@db.example.com:6543/app?sslmode=verify-full"
      );
    await page.getByRole("button", { name: "Apply DSN" }).click();
    expect(await testConnection(page)).toMatchObject({
      config: { host: "db.example.com", port: 6543, username: "alice" },
    });
    await expect(create).toBeEnabled();
    await page.getByLabel("Host").fill("db.internal");
    await expect(create).toBeDisabled();
    expect(await testConnection(page)).toMatchObject({
      config: { host: "db.internal", sslMode: "SSL_MODE_VERIFY_FULL" },
    });
  });
  await test.step("submit and land in the database explorer", async () => {
    const request = waitForRpc(page, CREATE);
    await create.click();
    expect(await request).toMatchObject({
      spec: {
        config: {
          database: "app",
          host: "db.internal",
          sslMode: "SSL_MODE_VERIFY_FULL",
        },
        displayName: "Production Postgres",
      },
    });
    await expect(page).toHaveURL(DATABASE_EXPLORER);
    await expect(page.getByRole("heading", { name: "public" })).toBeVisible();
  });
});
