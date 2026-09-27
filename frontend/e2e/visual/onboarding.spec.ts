import { create, toBinary } from "@bufbuild/protobuf";
import type { Page } from "playwright/test";
import { BadRequestSchema } from "../../src/protogen/google/rpc/error_details_pb";
import { expect, test } from "../tests/base";
import { fulfillJson, mockReadyEmptyApp, mockRpc } from "../tests/helpers";
import { mockOnboardingRequiredScenario } from "../tests/querylane-scenarios";

// Setup wizard and create instance visuals. Configure phases and the create
// instance form run on the real routes; setup progress needs a live server
// stream, so those phases open src/visual-harness scenarios instead. Behavior
// for the same states is covered by the rstest browser tests beside each
// component.

const ADVANCED_CONNECTION_OPTIONS_RE = /Advanced connection options/;
const UNREACHABLE_FIELD_MESSAGE =
  "PostgreSQL is unreachable with these connection settings. Check the host and port, then try again.";

function onboardingPanel(page: Page) {
  return page.getByTestId("onboarding-panel");
}

async function openSetupMethod(page: Page, method: string, heading: string) {
  await mockOnboardingRequiredScenario(page);
  await page.goto(`/setup?method=${method}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

async function openScenario(page: Page, scenario: string) {
  await page.goto(`/visual.html?scenario=${scenario}`);
  const frame = page.getByTestId("visual-frame");
  await expect(frame).toBeVisible();
  return frame;
}

test.describe("setup wizard configure phases", () => {
  test("UI-configured path shows the default connection fields", async ({
    page,
  }) => {
    await openSetupMethod(page, "ui_configured", "Querylane internal storage");
    await expect(page.getByLabel("Host")).toHaveValue("localhost");
    await expect(page.getByLabel("Database")).toHaveValue("querylane");
    await expect(onboardingPanel(page)).toHaveScreenshot(
      "onboarding-ui-configured-fields.png"
    );
  });

  test("UI-configured path shows advanced SSL negotiation options", async ({
    page,
  }) => {
    await openSetupMethod(page, "ui_configured", "Querylane internal storage");
    await page
      .getByRole("button", { name: ADVANCED_CONNECTION_OPTIONS_RE })
      .click();
    await expect(
      page.getByRole("combobox", { name: "SSL negotiation" })
    ).toBeVisible();
    await expect(onboardingPanel(page)).toHaveScreenshot(
      "onboarding-ui-configured-advanced-ssl.png"
    );
  });

  test("UI-configured path shows an applied connection string", async ({
    page,
  }) => {
    await openSetupMethod(page, "ui_configured", "Querylane internal storage");
    await page.getByRole("tab", { name: "Connection string" }).click();
    await page
      .getByLabel("PostgreSQL connection string")
      .fill(
        "postgres://admin:secret@db.internal:6432/querylane?sslmode=require"
      );
    await page.getByRole("button", { exact: true, name: "Apply" }).click();
    await expect(page.getByLabel("Host")).toHaveValue("db.internal");
    await expect(page.getByLabel("Port")).toHaveValue("6432");
    await expect(onboardingPanel(page)).toHaveScreenshot(
      "onboarding-ui-configured-applied-string.png"
    );
  });

  test("manual YAML path shows copyable configuration", async ({ page }) => {
    await openSetupMethod(page, "manual_yaml", "YAML Configuration");
    await expect(page.getByTestId("manual-yaml-config-preview")).toContainText(
      "database:"
    );
    await expect(onboardingPanel(page)).toHaveScreenshot(
      "onboarding-yaml-configuration.png"
    );
  });

  test("embedded path shows persistent storage with an automatic port", async ({
    page,
  }) => {
    await openSetupMethod(page, "embedded", "Embedded PostgreSQL");
    await expect(
      page.getByText("Local port, chosen automatically")
    ).toBeVisible();
    await expect(onboardingPanel(page)).toHaveScreenshot(
      "onboarding-embedded-configuration.png"
    );
  });
});

const SETUP_PROGRESS_SCENARIOS = [
  {
    heading: "Waiting for configuration",
    scenario: "onboarding-yaml-waiting",
    title: "manual YAML waits for the saved config file",
  },
  {
    heading: "Setting up Querylane",
    scenario: "onboarding-progress-running",
    title: "running progress shows the active setup step",
  },
  {
    heading: "Setup failed",
    scenario: "onboarding-progress-failed",
    title: "failed progress highlights likely configuration errors",
  },
  {
    heading: "Setup failed",
    scenario: "onboarding-storage-full",
    title: "embedded storage exhaustion shows only applicable recovery",
  },
  {
    heading: "You're all set!",
    scenario: "onboarding-progress-success",
    title: "successful progress gives a clear finish state",
  },
] as const;

test.describe("setup wizard progress phases", () => {
  for (const { heading, scenario, title } of SETUP_PROGRESS_SCENARIOS) {
    test(title, async ({ page }) => {
      const frame = await openScenario(page, scenario);
      await expect(frame.getByRole("heading", { name: heading })).toBeVisible();
      await expect(frame.getByTestId("onboarding-panel")).toHaveScreenshot(
        `${scenario}.png`
      );
    });
  }
});

test("invalid onboarding fields keep validation styling through keyboard focus", async ({
  page,
}) => {
  const frame = await openScenario(page, "onboarding-invalid-fields");
  const fields = frame.getByTestId("invalid-fields");

  await test.step("unfocused", async () => {
    await expect(fields.getByText("Enter a valid host")).toBeVisible();
    await expect(fields).toHaveScreenshot("invalid-onboarding-fields.png");
  });

  await test.step("host focused from the keyboard", async () => {
    await page.keyboard.press("Tab");
    await expect(fields.getByLabel("Host")).toBeFocused();
    await expect(fields).toHaveScreenshot("invalid-onboarding-host-focus.png");
  });

  await test.step("password focused from the keyboard", async () => {
    await page.keyboard.press("Tab");
    await expect(fields.getByLabel("Password", { exact: true })).toBeFocused();
    await expect(fields).toHaveScreenshot(
      "invalid-onboarding-password-focus.png"
    );
  });
});

async function openCreateInstance(page: Page) {
  await mockReadyEmptyApp(page);
  await page.goto("/new-instance");
  await expect(
    page.getByRole("heading", { name: "Postgres server to manage" })
  ).toBeVisible();
}

function createInstanceForm(page: Page) {
  return page.getByTestId("create-instance-page");
}

async function fillRequiredConnectionFields(page: Page) {
  await page.getByLabel("Display name").fill("Production");
  await page.getByLabel("Host").fill("localhost");
  await page.getByLabel("Default database").fill("postgres");
  await page.getByLabel("Username").fill("postgres");
  await page.getByRole("textbox", { name: "Password" }).fill("secret");
}

async function mockTestConnectionFailure(
  page: Page,
  body: Record<string, unknown>,
  status: number
) {
  await page.route("**/TestInstanceConnection", async (route) => {
    await fulfillJson(route, body, status);
  });
  await page.route("**.TestInstanceConnection", async (route) => {
    await fulfillJson(route, body, status);
  });
}

function unreachableFieldViolations() {
  const badRequest = create(BadRequestSchema, {
    fieldViolations: [
      { description: UNREACHABLE_FIELD_MESSAGE, field: "config.host" },
      { description: UNREACHABLE_FIELD_MESSAGE, field: "config.port" },
    ],
  });
  return {
    code: "invalid_argument",
    details: [
      {
        type: "google.rpc.BadRequest",
        value: Buffer.from(toBinary(BadRequestSchema, badRequest)).toString(
          "base64"
        ),
      },
    ],
    message: "invalid CreateInstanceRequest",
  };
}

test.describe("create instance form", () => {
  test("initial setup path", async ({ page }) => {
    await openCreateInstance(page);
    await expect(createInstanceForm(page)).toHaveScreenshot(
      "create-instance-initial.png"
    );
  });

  test("DSN-prefilled advanced fields stay readable", async ({ page }) => {
    await openCreateInstance(page);
    await page.getByLabel("Display name").fill("Production analytics writer");
    await page
      .getByLabel("Connection string")
      .fill(
        "postgres://reporter:secret@analytics-writer.internal.querylane.test:6543/warehouse?sslmode=verify-full"
      );
    await page.getByRole("button", { name: "Apply DSN" }).click();
    await expect(page.getByLabel("Host")).toHaveValue(
      "analytics-writer.internal.querylane.test"
    );
    await page.getByRole("button", { name: "Show advanced options" }).click();
    await page.getByRole("button", { name: "Add label" }).click();
    await page.getByPlaceholder("Key").fill("environment");
    await page.getByPlaceholder("Value").fill("production");
    await expect(createInstanceForm(page)).toHaveScreenshot(
      "create-instance-dsn-advanced.png"
    );
  });

  test("validation errors are visible before any request", async ({ page }) => {
    await openCreateInstance(page);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Display name is required.")).toBeVisible();
    await expect(createInstanceForm(page)).toHaveScreenshot(
      "create-instance-validation.png"
    );
  });

  test("advanced label key errors stay next to the label", async ({ page }) => {
    await openCreateInstance(page);
    await page.getByLabel("Display name").fill("Prod");
    await page.getByLabel("Host").fill("localhost");
    await page.getByRole("textbox", { name: "Password" }).fill("secret");
    await page.getByRole("button", { name: "Show advanced options" }).click();
    await page.getByRole("button", { name: "Add label" }).click();
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("Label keys cannot be empty.")).toBeVisible();
    await expect(page.getByPlaceholder("Key")).toBeFocused();
    await expect(createInstanceForm(page)).toHaveScreenshot(
      "create-instance-advanced-label-error.png"
    );
  });

  test("successful connection test unlocks create, and edits lock it again", async ({
    page,
  }) => {
    await openCreateInstance(page);
    await mockRpc(page, "TestInstanceConnection", {});
    await fillRequiredConnectionFields(page);
    const createButton = page.getByRole("button", { name: "Create instance" });

    await test.step("connection succeeds", async () => {
      await page.getByRole("button", { name: "Test connection" }).click();
      await expect(page.getByText("Connection successful.")).toBeVisible();
      await expect(createButton).toBeEnabled();
      await expect(createInstanceForm(page)).toHaveScreenshot(
        "create-instance-connection-success.png"
      );
    });

    await test.step("connection fields change", async () => {
      await page.getByLabel("Display name").fill("Production renamed");
      await page.getByLabel("Host").fill("db.internal");
      await expect(createButton).toBeDisabled();
      await expect(createInstanceForm(page)).toHaveScreenshot(
        "create-instance-retest-required.png"
      );
    });
  });

  test("connection failure keeps create blocked with inline feedback", async ({
    page,
  }) => {
    await openCreateInstance(page);
    await mockTestConnectionFailure(
      page,
      { code: "internal", message: "connection refused" },
      500
    );
    await fillRequiredConnectionFields(page);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByText("connection refused")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create instance" })
    ).toBeDisabled();
    await expect(createInstanceForm(page)).toHaveScreenshot(
      "create-instance-connection-failure.png"
    );
  });

  test("server field errors stay anchored to connection fields", async ({
    page,
  }) => {
    await openCreateInstance(page);
    await mockTestConnectionFailure(page, unreachableFieldViolations(), 400);
    await fillRequiredConnectionFields(page);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByLabel("Host")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await expect(page.getByLabel("Port")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await expect(page.getByLabel("Host")).toBeFocused();
    await expect(createInstanceForm(page)).toHaveScreenshot(
      "create-instance-server-field-errors.png"
    );
  });
});
