import { HttpResponse } from "msw";
import { expect, test } from "./browser.test-utils";
import {
  mockRpc,
  mockRpcResponse,
  mockRpcWith,
  waitForRpc,
} from "./msw-network.test-utils";
import {
  mockConfigManagedReadyConsole,
  mockDatabases,
  mockInstanceCatalog,
  mockInstanceDetails,
  mockOverviewSupportData,
  mockReadyAppWithDeletableInstance,
  mockReadyAppWithInstance,
  mockReadyOnboarding,
  mockRoles,
  sampleDatabase,
  sampleInstance,
  sampleReportingInstance,
} from "./querylane-rpc.fixture";

const COLUMNS_URL_RE = /columns=/u;
const REPORTING_INSTANCE_URL = /\/instances\/reporting\/?$/u;

test.beforeEach(async ({ page }) => {
  await mockOverviewSupportData(page);
});

test("instance configuration: saves changed connection fields with field mask", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await mockReadyAppWithInstance(page);

  await mockRpc(page, "InstanceService/UpdateInstance", {
    instance: {
      ...sampleInstance,
      config: { ...sampleInstance.config, host: "db.internal" },
    },
  });

  await page.goto("/instances/production/configuration");
  await page.getByRole("textbox", { name: "Host" }).fill("db.internal");
  const saved = waitForRpc(page, "InstanceService/UpdateInstance");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Instance configuration saved.")).toBeVisible();
  expect(await saved).toMatchObject({
    updateMask: "config.host",
    instance: { config: { host: "db.internal" }, name: "instances/production" },
  });
});

test("instance configuration: config-managed instances render read-only notice", {
  tag: ["@feat:instances", "@flow:update"],
}, async ({ page }) => {
  await mockReadyOnboarding(page);
  await mockConfigManagedReadyConsole(page);
  await mockInstanceCatalog(page, [sampleInstance]);
  await mockInstanceDetails(page, sampleInstance);
  await mockDatabases(page, [sampleDatabase]);

  await page.goto("/instances/production/configuration");

  await expect(page.getByText("Managed via configuration file")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Host" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Delete instance" })
  ).toBeHidden();
});

test("instance configuration: delete requires its resource name and preserves the remaining instance", {
  tag: ["@feat:instances", "@flow:navigate"],
}, async ({ page }) => {
  await mockReadyAppWithDeletableInstance(page);
  let deleted = false;
  await mockRpcWith(page, "InstanceService/ListInstances", () => ({
    instances: deleted
      ? [sampleReportingInstance]
      : [sampleInstance, sampleReportingInstance],
    nextPageToken: "",
  }));
  await mockRpcWith(page, "InstanceService/GetInstance", ({ name }) => ({
    instance:
      name === sampleReportingInstance.name
        ? sampleReportingInstance
        : sampleInstance,
  }));
  await mockRpcWith(page, "DatabaseService/ListDatabases", ({ parent }) => ({
    databases: parent === sampleInstance.name ? [sampleDatabase] : [],
    nextPageToken: "",
  }));
  await mockRpcResponse(page, "InstanceService/DeleteInstance", () => {
    deleted = true;
    return HttpResponse.json({});
  });
  await page.goto("/instances/production/configuration");

  await page.getByRole("button", { name: "Delete instance" }).first().click();
  const dialog = page.getByRole("alertdialog", { name: "Delete instance?" });
  const confirmation = dialog.getByLabel(
    "Type instances/production to confirm"
  );
  const remove = dialog.getByRole("button", { name: "Delete instance" });
  await confirmation.fill("production");
  await expect(remove).toBeDisabled();
  await confirmation.fill("instances/production");
  const deletedInstance = waitForRpc(page, "InstanceService/DeleteInstance");
  await remove.click();

  expect(await deletedInstance).toMatchObject({ name: "instances/production" });
  await expect(page).toHaveURL(REPORTING_INSTANCE_URL);
  await expect(
    page.getByRole("heading", { name: "Reporting Postgres" })
  ).toBeVisible();
  await page.getByRole("link", { name: "Configuration" }).click();
  await expect(
    page.getByRole("button", { name: "Delete instance" })
  ).toBeDisabled();
  await expect(
    page.getByText("Querylane needs at least one registered instance.", {
      exact: false,
    })
  ).toBeVisible();
});

test("list columns: bookmark, reload and reset preserve the roles view", async ({
  page,
}) => {
  await mockReadyAppWithDeletableInstance(page);
  await mockRoles(page);
  await page.goto("/instances/production/roles");
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Role" })).toBeVisible();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  const projected = waitForRpc(
    page,
    "RoleService/ListRoles",
    (request) =>
      typeof request["readMask"] === "string" &&
      !request["readMask"].includes("comment")
  );
  await page
    .getByRole("menuitemcheckbox", { name: "Role", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("columnheader", { name: "Role" })).toHaveCount(
    0
  );
  await expect(page).toHaveURL(COLUMNS_URL_RE);
  expect(await projected).toMatchObject({ readMask: expect.any(String) });
  await page.reload();
  await expect(
    table.getByRole("columnheader", { name: "Login" })
  ).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Role" })).toHaveCount(
    0
  );
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reset columns" }).click();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("columnheader", { name: "Role" })).toBeVisible();
  await expect(page).not.toHaveURL(COLUMNS_URL_RE);
});
