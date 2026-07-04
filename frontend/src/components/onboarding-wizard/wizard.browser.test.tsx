import { create as createProto } from "@bufbuild/protobuf";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { OnboardingBrowserHarness } from "@/__tests__/browser-test-utils";
import type { ConfigMethod } from "@/components/onboarding-wizard/types";
import { OnboardingWizardContent } from "@/components/onboarding-wizard/wizard-content";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  AppDatabaseStatus_State,
  AppDatabaseStatusSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  GetOnboardingStateResponseSchema,
  SetupMethod,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import { useOnboardingWizardStore } from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";

const ADVANCED_CONNECTION_OPTIONS_RE = /Advanced connection options/;
const INVALID_CONNECTION_STRING_RE = /Invalid connection string/;

vi.mock("@/hooks/api/instance", () => ({
  useTestInstanceConnectionMutation: () => ({
    mutateAsync: vi.fn(async () => undefined),
  }),
}));

function onboardingState() {
  return createProto(GetOnboardingStateResponseSchema, {
    appDatabaseStatus: createProto(AppDatabaseStatusSchema, {
      state: AppDatabaseStatus_State.NOT_CONFIGURED,
    }),
    availableMethods: [
      SetupMethod.UI_CONFIGURED,
      SetupMethod.MANUAL_YAML,
      SetupMethod.EMBEDDED,
    ],
    configFilePath: "/Users/you/.querylane/config.yaml",
    embeddedDataPath: "/Users/you/.querylane/pgdata",
    homePath: "/Users/you/.querylane",
    isConfigured: false,
    isHomeWritable: true,
  });
}

function progressEvent(
  stepId: SetupStep,
  displayName: string,
  state: StepState,
  error = ""
) {
  return createProto(SetupProgressEventSchema, {
    displayName,
    error,
    state,
    stepId,
  });
}

function renderWizard() {
  render(
    <OnboardingBrowserHarness>
      <OnboardingWizardContent />
    </OnboardingBrowserHarness>
  );
}

function getConfigurePhase(method: ConfigMethod) {
  if (method === "ui_configured") {
    return "configure_ui";
  }
  if (method === "manual_yaml") {
    return "configure_yaml";
  }
  return "configure_embedded";
}

function openConfigurePhase(method: ConfigMethod) {
  useOnboardingWizardStore.setState({
    phase: getConfigurePhase(method),
    selectedMethod: method,
  });
  renderWizard();
}

function renderRunningProgress() {
  useOnboardingWizardStore.setState({
    phase: "progress_running",
    progressEvents: [
      progressEvent(
        SetupStep.CONNECTING,
        "Connect to PostgreSQL",
        StepState.SUCCEEDED
      ),
      progressEvent(
        SetupStep.MIGRATING,
        "Apply migrations",
        StepState.IN_PROGRESS
      ),
      progressEvent(
        SetupStep.INITIALIZING_SERVICES,
        "Initialize services",
        StepState.PENDING
      ),
    ],
    selectedMethod: "ui_configured",
  });
  renderWizard();
}

function renderFailedProgress() {
  const errorMessage = "password authentication failed for user querylane";
  useOnboardingWizardStore.setState({
    failedEvent: progressEvent(
      SetupStep.MIGRATING,
      "Apply migrations",
      StepState.FAILED,
      errorMessage
    ),
    phase: "error_summary",
    progressEvents: [
      progressEvent(
        SetupStep.CONNECTING,
        "Connect to PostgreSQL",
        StepState.SUCCEEDED
      ),
      progressEvent(
        SetupStep.MIGRATING,
        "Apply migrations",
        StepState.FAILED,
        errorMessage
      ),
    ],
    selectedMethod: "ui_configured",
    streamError: normalizeAppUiError(new Error(errorMessage), {
      request: {
        host: "localhost:8080",
        plaintext: true,
        requestJson: "{}",
        requestJsonNote: null,
        requestMethod: "POST",
        rpcPath: "/querylane.console.v1alpha1.ConsoleService/Setup",
        url: "http://localhost:8080/querylane.console.v1alpha1.ConsoleService/Setup",
      },
      source: "setup_stream",
    }),
  });
  renderWizard();
}

function renderSuccessfulProgress() {
  useOnboardingWizardStore.setState({
    phase: "progress_success",
    progressEvents: [
      progressEvent(
        SetupStep.CONNECTING,
        "Connect to PostgreSQL",
        StepState.SUCCEEDED
      ),
      progressEvent(
        SetupStep.MIGRATING,
        "Apply migrations",
        StepState.SUCCEEDED
      ),
      progressEvent(
        SetupStep.INITIALIZING_SERVICES,
        "Initialize services",
        StepState.SUCCEEDED
      ),
    ],
    selectedMethod: "ui_configured",
  });
  renderWizard();
}

beforeEach(() => {
  useSetupStore.setState({
    bootError: null,
    onboardingState: onboardingState(),
    showDegradedBanner: false,
    showWizardErrorBanner: false,
    status: "onboarding",
    warningCode: null,
  });
  useOnboardingWizardStore.getState().resetSession();
});

describe("Onboarding wizard — browser visuals", () => {
  test("method selection presents all available ways to get started", async () => {
    renderWizard();

    await expect
      .element(
        page.getByRole("heading", {
          name: "How would you like to get started?",
        })
      )
      .toBeVisible();
    await expect.element(page.getByText("Recommended")).toBeVisible();
    await expect
      .element(page.getByText("Configure YAML manually"))
      .toBeVisible();
    await expect.element(page.getByText("Use embedded database")).toBeVisible();
    await expect.element(page.getByTestId("onboarding-panel")).toBeVisible();
  });

  test("UI-configured path renders the default connection fields", async () => {
    openConfigurePhase("ui_configured");

    await expect
      .element(
        page.getByRole("heading", { name: "Querylane internal storage" })
      )
      .toBeVisible();
    await expect.element(page.getByLabelText("Host")).toHaveValue("localhost");
    await expect
      .element(page.getByLabelText("Database"))
      .toHaveValue("querylane");
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-ui-configured-fields"
    );
  });

  test("UI-configured path renders advanced SSL negotiation options", async () => {
    openConfigurePhase("ui_configured");

    await page
      .getByRole("button", { name: ADVANCED_CONNECTION_OPTIONS_RE })
      .click();

    await expect
      .element(page.getByRole("combobox", { name: "SSL negotiation" }))
      .toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-ui-configured-advanced-ssl"
    );
  });

  test("UI-configured path requires a successful connection test before continuing", async () => {
    await openConfigurePhase("ui_configured");

    await page.getByRole("textbox", { name: "Password" }).fill("secret");

    await expect
      .element(page.getByRole("button", { name: "Continue" }))
      .toBeDisabled();

    await page.getByRole("button", { name: "Test connection" }).click();

    await expect
      .element(page.getByRole("button", { name: "Continue" }))
      .not.toBeDisabled();

    await page.getByLabelText("Host").fill("db.internal");

    await expect
      .element(page.getByRole("button", { name: "Continue" }))
      .toBeDisabled();
  });

  test("UI-configured path applies a pasted connection string", async () => {
    openConfigurePhase("ui_configured");

    await page.getByRole("button", { name: "Paste connection string" }).click();
    await page
      .getByLabelText("Connection string")
      .fill("not-a-connection-string");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect
      .element(page.getByText(INVALID_CONNECTION_STRING_RE))
      .toBeVisible();

    await page
      .getByLabelText("Connection string")
      .fill(
        "postgres://admin:secret@db.internal:6432/querylane?sslmode=require"
      );
    await page.getByRole("button", { name: "Apply" }).click();

    await expect
      .element(page.getByLabelText("Host"))
      .toHaveValue("db.internal");
    await expect.element(page.getByLabelText("Port")).toHaveValue("6432");
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-ui-configured-applied-string"
    );
  });

  test("manual YAML path shows copyable configuration", async () => {
    openConfigurePhase("manual_yaml");

    await expect
      .element(page.getByRole("heading", { name: "YAML Configuration" }))
      .toBeVisible();
    await expect
      .element(page.getByText("/Users/you/.querylane/config.yaml").first())
      .toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-yaml-configuration"
    );
  });

  test("manual YAML path shows the waiting-for-config state", async () => {
    useOnboardingWizardStore.setState({
      phase: "progress_waiting_for_config",
      selectedMethod: "manual_yaml",
    });
    renderWizard();

    await expect
      .element(page.getByRole("heading", { name: "Waiting for configuration" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "I've saved the file" }))
      .toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-yaml-waiting"
    );
  });

  test("embedded path exposes port, persistence, and data-directory details", async () => {
    openConfigurePhase("embedded");

    await expect
      .element(page.getByRole("heading", { name: "Embedded PostgreSQL" }))
      .toBeVisible();
    await expect.element(page.getByLabelText("Port")).toHaveValue("5433");
    await expect
      .element(page.getByText("/Users/you/.querylane/pgdata"))
      .toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-embedded-configuration"
    );
  });

  test("running progress explains which setup step is active", async () => {
    renderRunningProgress();

    await expect
      .element(page.getByRole("heading", { name: "Setting up Querylane" }))
      .toBeVisible();
    await expect
      .element(page.getByText("Apply migrations").first())
      .toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-progress-running"
    );
  });

  test("failed progress highlights likely configuration errors", async () => {
    renderFailedProgress();

    await expect
      .element(page.getByRole("heading", { name: "Setup failed" }))
      .toBeVisible();
    await expect
      .element(page.getByText("Likely a configuration issue"))
      .toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-progress-failed"
    );
  });

  test("successful progress gives a clear finish state", async () => {
    renderSuccessfulProgress();

    await expect
      .element(page.getByRole("heading", { name: "You're all set!" }))
      .toBeVisible();
    await expect.element(page.getByText("Ready to go!")).toBeVisible();
    await expect(page.getByTestId("onboarding-panel")).toMatchScreenshot(
      "onboarding-progress-success"
    );
  });
});
