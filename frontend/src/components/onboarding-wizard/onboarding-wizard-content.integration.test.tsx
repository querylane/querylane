import { create as createProto } from "@bufbuild/protobuf";
import { TransportProvider } from "@connectrpc/connect-query";
import { afterEach, beforeEach, describe, expect, it, rs } from "@rstest/core";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OnboardingWizardControllerProvider } from "@/components/onboarding-wizard/controller-provider";
import type { OnboardingWizardController } from "@/components/onboarding-wizard/hooks/use-onboarding-wizard-controller";
import type { ConfigMethod } from "@/components/onboarding-wizard/types";
import { OnboardingWizard } from "@/components/onboarding-wizard/wizard";
import { OnboardingWizardContent } from "@/components/onboarding-wizard/wizard-content";
import { normalizeAppUiError } from "@/lib/ui-error";
import {
  AppDatabaseStatus_State,
  AppDatabaseStatusSchema,
} from "@/protogen/querylane/console/v1alpha1/console_pb";
import {
  InstanceService,
  PostgresConfig_SslMode,
  PostgresConfig_SslNegotiation,
} from "@/protogen/querylane/console/v1alpha1/instance_pb";
import {
  GetOnboardingStateResponseSchema,
  SetupMethod,
  SetupProgressEventSchema,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";
import {
  DEFAULT_WIZARD_SESSION_STATE,
  useOnboardingWizardStore,
} from "@/stores/onboarding-wizard-store";
import { useSetupStore } from "@/stores/setup-store";
import { createTestQueryClient } from "@/test/query-client";
import { createTestRouterTransport } from "@/test/router-transport";
import { ThemeProvider } from "@/theme-provider";

const CONFIGURE_UI_RE = /Configure via UI/;
const EMBEDDED_RE = /Use embedded database/;
const ADVANCED_CONNECTION_OPTIONS_RE = /Advanced connection options/;
const DIRECT_SSL_NEGOTIATION_OPTION_RE = /^direct /i;
const INVALID_CONNECTION_STRING_RE = /Invalid connection string/i;
const REQUIRE_SSL_MODE_OPTION_RE = /^require /i;
const BACK_RE = /back/i;

let restoreLocalStorage: (() => void) | undefined;
const renderedQueryClients: QueryClient[] = [];

function installLocalStorageStub() {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "localStorage"
  );
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(window, "localStorage", originalDescriptor);
      return;
    }

    Reflect.deleteProperty(window, "localStorage");
  };
}

function createOnboardingState(
  overrides: Partial<
    Parameters<typeof createProto<typeof GetOnboardingStateResponseSchema>>[1]
  > = {}
) {
  return createProto(GetOnboardingStateResponseSchema, {
    appDatabaseStatus: createProto(AppDatabaseStatusSchema, {
      state: AppDatabaseStatus_State.NOT_CONFIGURED,
    }),
    availableMethods: [
      SetupMethod.UI_CONFIGURED,
      SetupMethod.MANUAL_YAML,
      SetupMethod.EMBEDDED,
    ],
    configFilePath: "/tmp/querylane/config.yaml",
    embeddedDataPath: "/tmp/querylane/embedded-postgres",
    homePath: "/tmp/querylane",
    isConfigured: false,
    isHomeWritable: true,
    ...overrides,
  });
}

function createController(
  overrides: Partial<OnboardingWizardController> = {}
): OnboardingWizardController {
  return {
    finishWizard: rs.fn(),
    goBackToConfigure: rs.fn(),
    goBackToMethodSelection: rs.fn(),
    refreshOnboardingState: rs.fn(async () => undefined),
    retryWatch: rs.fn(async () => undefined),
    setupRunning: false,
    watchIsRunning: false,
    watchManualRetryRequired: false,
    watchRetryPending: false,
    ...overrides,
  };
}

function renderWizard(
  controller = createController(),
  testInstanceConnection = rs.fn(async () => ({}))
) {
  const queryClient = createTestQueryClient();
  renderedQueryClients.push(queryClient);
  const transport = createTestRouterTransport(({ service }) => {
    service(InstanceService, {
      testInstanceConnection,
    });
  });

  return {
    controller,
    testInstanceConnection,
    ...render(
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="dark">
            <OnboardingWizardControllerProvider controller={controller}>
              <OnboardingWizardContent />
            </OnboardingWizardControllerProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </TransportProvider>
    ),
  };
}

function renderRealWizard(initialMethod: ConfigMethod) {
  const queryClient = createTestQueryClient();
  renderedQueryClients.push(queryClient);
  const transport = createTestRouterTransport(({ service }) => {
    service(InstanceService, {
      testInstanceConnection: rs.fn(async () => ({})),
    });
  });

  return render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <OnboardingWizard initialMethod={initialMethod} />
        </ThemeProvider>
      </QueryClientProvider>
    </TransportProvider>
  );
}

function seedOnboardingState() {
  useSetupStore.setState({
    onboardingState: createOnboardingState(),
    refreshOnboardingState: rs.fn(async () => undefined),
    showWizardErrorBanner: false,
    status: "onboarding",
  });
}

function setFieldValue(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), {
    target: { value },
  });
}

function seedWizardPhase(
  phase: "configure_embedded" | "configure_ui" | "configure_yaml",
  selectedMethod: "embedded" | "manual_yaml" | "ui_configured"
) {
  seedOnboardingState();
  useOnboardingWizardStore.setState({
    phase,
    selectedMethod,
  });
}

beforeEach(() => {
  restoreLocalStorage = installLocalStorageStub();
});

afterEach(() => {
  cleanup();
  for (const queryClient of renderedQueryClients) {
    queryClient.clear();
  }
  renderedQueryClients.length = 0;
  restoreLocalStorage?.();
  restoreLocalStorage = undefined;
  useOnboardingWizardStore.setState(DEFAULT_WIZARD_SESSION_STATE);
  useSetupStore.setState({
    bootError: null,
    onboardingState: null,
    showDegradedBanner: false,
    showWizardErrorBanner: false,
    status: "booting",
    warningCode: null,
  });
});

describe("onboarding wizard content integration", () => {
  it("validates and applies a pasted metadata database connection string", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    await user.click(screen.getByRole("tab", { name: "Connection string" }));
    setFieldValue("PostgreSQL connection string", "not-a-dsn");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText(INVALID_CONNECTION_STRING_RE)).toBeTruthy();

    setFieldValue(
      "PostgreSQL connection string",
      "postgres://meta:secret@metadata.internal:6543/querylane?sslmode=require&sslnegotiation=direct"
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByLabelText("Host")).toHaveProperty(
      "value",
      "metadata.internal"
    );
    expect(screen.getByLabelText("Port")).toHaveProperty("value", "6543");
    expect(screen.getByLabelText("Database")).toHaveProperty(
      "value",
      "querylane"
    );
    expect(screen.getByLabelText("Username")).toHaveProperty("value", "meta");
    expect(
      screen.getByRole("combobox", { name: "SSL negotiation" }).textContent
    ).toContain("direct");
  });

  it("clears stale field errors when applying a connection string", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    // Surface a password error through interaction first.
    setFieldValue("Password", "x");
    setFieldValue("Password", "");
    await waitFor(() => {
      expect(
        screen.getByLabelText("Password").getAttribute("aria-invalid")
      ).toBe("true");
    });

    await user.click(screen.getByRole("tab", { name: "Connection string" }));
    setFieldValue(
      "PostgreSQL connection string",
      "postgres://meta:secret@metadata.internal:6543/querylane?sslmode=require"
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    // Apply must validate the applied values so the stale error clears.
    expect(screen.getByLabelText("Password")).toHaveProperty("value", "secret");
    await waitFor(() => {
      expect(
        screen.getByLabelText("Password").getAttribute("aria-invalid")
      ).toBeNull();
    });
  });

  it("renders embedded setup defaults from onboarding state", async () => {
    const user = userEvent.setup();
    seedOnboardingState();

    renderWizard();

    await user.click(screen.getByRole("radio", { name: EMBEDDED_RE }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByRole("heading", { name: "Embedded PostgreSQL" })
    ).toBeTruthy();
    expect(
      screen.getByText("Persistent: data is kept across restarts")
    ).toBeTruthy();
    expect(screen.getByText("/tmp/querylane/embedded-postgres")).toBeTruthy();
    expect(screen.getByText("Local port, chosen automatically")).toBeTruthy();
  });
});

describe("onboarding wizard connection testing", () => {
  it("validates required fields before testing the connection", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    const { testInstanceConnection } = renderWizard();

    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(
        screen.getByLabelText("Password").getAttribute("aria-invalid")
      ).toBe("true");
    });
    expect(screen.getByText("This field is required.")).toBeTruthy();
    expect(testInstanceConnection).not.toHaveBeenCalled();
  });

  it("clears stale connection failures after the configuration changes", async () => {
    const user = userEvent.setup();
    const testInstanceConnection = rs.fn(() =>
      Promise.reject(new Error("connection refused"))
    );
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard(createController(), testInstanceConnection);

    setFieldValue("Password", "secret");
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => {
      expect(screen.getByText("connection refused")).toBeTruthy();
    });

    setFieldValue("Host", "metadata.internal");

    expect(screen.queryByText("connection refused")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Test connection" })
    ).toBeTruthy();
  });
});

describe("onboarding wizard setup progression", () => {
  it("submits direct SSL negotiation from advanced connection options", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_ui", "ui_configured");

    renderWizard();

    expect(
      screen.queryByRole("combobox", { name: "SSL negotiation" })
    ).toBeNull();

    setFieldValue("Host", "metadata.internal");
    setFieldValue("Password", "secret");
    await user.click(
      screen.getByRole("button", { name: ADVANCED_CONNECTION_OPTIONS_RE })
    );
    await user.click(screen.getByRole("combobox", { name: "SSL mode" }));
    await user.click(
      screen.getByRole("option", { name: REQUIRE_SSL_MODE_OPTION_RE })
    );
    await user.click(screen.getByRole("combobox", { name: "SSL negotiation" }));
    await user.click(
      screen.getByRole("option", { name: DIRECT_SSL_NEGOTIATION_OPTION_RE })
    );
    await user.click(screen.getByRole("button", { name: "Test connection" }));

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Continue" })
          .disabled
      ).toBe(false);
    });
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const state = useOnboardingWizardStore.getState();
    expect(state.submittedPostgresConfig?.sslMode).toBe(
      PostgresConfig_SslMode.REQUIRE
    );
    expect(state.submittedPostgresConfig?.sslNegotiation).toBe(
      PostgresConfig_SslNegotiation.DIRECT
    );
  });

  it("starts file-watch progress from manual YAML setup", async () => {
    const user = userEvent.setup();
    seedWizardPhase("configure_yaml", "manual_yaml");

    renderWizard();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(useOnboardingWizardStore.getState().phase).toBe(
      "progress_waiting_for_config"
    );
    expect(
      screen.getByRole("heading", { name: "Waiting for configuration" })
    ).toBeTruthy();
  });

  it("renders successful setup completion and calls finish action", async () => {
    const user = userEvent.setup();
    const finishWizard = rs.fn();
    seedOnboardingState();
    useOnboardingWizardStore.setState({
      phase: "progress_success",
      progressEvents: [
        createProto(SetupProgressEventSchema, {
          displayName: "Migrate metadata",
          state: StepState.SUCCEEDED,
          stepId: SetupStep.MIGRATING,
        }),
      ],
      selectedMethod: "ui_configured",
    });

    renderWizard(createController({ finishWizard }));

    expect(screen.getByText("Ready to go!")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(finishWizard).toHaveBeenCalledTimes(1);
  });

  it("classifies connection setup failures as reconfigurable", async () => {
    const user = userEvent.setup();
    seedOnboardingState();
    useOnboardingWizardStore.setState({
      failedEvent: createProto(SetupProgressEventSchema, {
        displayName: "Connect to metadata database",
        error: "connection refused",
        state: StepState.FAILED,
        stepId: SetupStep.CONNECTING,
      }),
      phase: "error_summary",
      progressEvents: [
        createProto(SetupProgressEventSchema, {
          displayName: "Connect to metadata database",
          error: "connection refused",
          state: StepState.FAILED,
          stepId: SetupStep.CONNECTING,
        }),
      ],
      selectedMethod: "ui_configured",
      streamError: normalizeAppUiError(new Error("connection refused"), {
        area: "onboarding-setup",
        source: "setup_stream",
      }),
    });

    renderWizard();

    expect(screen.getByRole("heading", { name: "Setup failed" })).toBeTruthy();
    expect(screen.getByText("Likely a configuration issue")).toBeTruthy();
    expect(screen.getByText("Configuration file")).toBeTruthy();
    expect(screen.getByText("/tmp/querylane/config.yaml")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Reconfigure" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Querylane internal storage" })
      ).toBeTruthy();
    });
  });

  it("explains how to recover when embedded setup runs out of disk space", async () => {
    const user = userEvent.setup();
    const error =
      "write /Users/alice/.querylane/postgres/base/16384/2600: no space left on device";
    const failedEvent = createProto(SetupProgressEventSchema, {
      displayName: "Starting embedded PostgreSQL",
      error,
      state: StepState.FAILED,
      stepId: SetupStep.STARTING_EMBEDDED,
    });
    seedOnboardingState();
    useOnboardingWizardStore.setState({
      failedEvent,
      phase: "error_summary",
      progressEvents: [failedEvent],
      selectedMethod: "embedded",
      streamError: normalizeAppUiError(new Error(error), {
        area: "onboarding-setup",
        source: "setup_stream",
      }),
    });

    renderWizard();

    expect(screen.getAllByText("Storage full")).not.toHaveLength(0);
    expect(
      screen.getAllByText(
        "Free disk space where Querylane stores embedded PostgreSQL data, then retry."
      )
    ).not.toHaveLength(0);
    expect(screen.queryByText("May be a transient issue")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reconfigure" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Report bug" })).toBeNull();
    expect(screen.queryByText(error)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Error details" }));

    expect(
      await screen.findAllByText(error, { exact: false })
    ).not.toHaveLength(0);
  });

  it("deep links to the configure phase via initialMethod", async () => {
    const user = userEvent.setup();
    seedOnboardingState();

    renderRealWizard("ui_configured");

    expect(
      await screen.findByRole("heading", { name: "Querylane internal storage" })
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: BACK_RE }));

    expect(
      screen.getByRole("heading", {
        name: "How would you like to get started?",
      })
    ).toBeTruthy();
    expect(
      screen
        .getByRole("radio", { name: CONFIGURE_UI_RE })
        .getAttribute("aria-checked")
    ).toBe("true");
  });
});
